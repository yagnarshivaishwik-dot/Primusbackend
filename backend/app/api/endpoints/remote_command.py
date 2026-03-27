import asyncio
import json
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.api.endpoints.client_pc import get_current_device
from app.database import get_db
from app.models import ClientPC, RemoteCommand, SystemEvent
from app.schemas import RemoteCommandIn, RemoteCommandOut
from app.ws.pc import notify_pc

router = APIRouter()


def _validate_command_params(command: str, params: str | None) -> None:
    """
    Validate that command parameters are within reasonable limits.
    """
    if params and len(params) > 1024:
        raise HTTPException(status_code=400, detail="Command parameters too large")

    # Only allow specific commands for now
    allowed_commands = {
        "lock",
        "unlock",
        "message",
        "shutdown",
        "reboot",
        "screenshot",
        "login",
        "logout",
        "restart",
    }
    if command not in allowed_commands:
        raise HTTPException(status_code=400, detail=f"Unsupported command: {command}")


# Admin sends a command to a PC
@router.post("/send", response_model=RemoteCommandOut)
async def send_command(
    cmd: RemoteCommandIn,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    _validate_command_params(cmd.command, cmd.params)

    pc = db.query(ClientPC).filter_by(id=cmd.pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")

    # MASTER SYSTEM: Capability Negotiation (Relaxed for now)
    # Allow core system commands unconditionally; future versions can enforce more
    # Skip strict capability check - just proceed with the command

    rc = RemoteCommand(
        pc_id=cmd.pc_id,
        command=cmd.command,
        params=cmd.params if isinstance(cmd.params, str) else json.dumps(cmd.params),
        state="PENDING",
        issued_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        executed=False,
    )
    db.add(rc)
    db.commit()
    db.refresh(rc)

    # Emit System Event for Admin UI
    event = SystemEvent(
        type="command.created",
        cafe_id=pc.cafe_id,
        pc_id=pc.id,
        payload={"command_id": rc.id, "command": rc.command, "params": rc.params},
    )
    db.add(event)
    db.commit()

    # Update PC status immediately for shutdown/reboot commands
    # so the admin UI shows "Shutting Down" / "Restarting" instead of "Offline"
    new_status = None
    if cmd.command == "shutdown":
        new_status = "shutting_down"
    elif cmd.command in ("reboot", "restart"):
        new_status = "restarting"

    if new_status:
        pc.status = new_status
        status_event = SystemEvent(
            type="pc.status",
            cafe_id=pc.cafe_id,
            pc_id=pc.id,
            payload={"status": new_status},
        )
        db.add(status_event)
        db.commit()

    # CRITICAL FIX: Push command instantly via WebSocket for immediate delivery.
    # The HTTP long-polling is the fallback; WS push ensures near-zero latency.
    try:
        await notify_pc(
            cmd.pc_id,
            json.dumps({
                "event": "command",
                "payload": {
                    "id": rc.id,
                    "command": rc.command,
                    "params": rc.params,
                    "issued_at": rc.issued_at.isoformat(),
                    "expires_at": rc.expires_at.isoformat(),
                },
            }),
        )
    except Exception:
        pass  # Best-effort — client will still pick up via polling

    return rc


def queue_device_event(db: Session, pc_id: int, event_type: str, payload: dict):
    """
    MASTER SYSTEM: Queue an event for a device to pick up via Long Polling.
    This replaces WebSocket notification for better reliability.
    """
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        return

    rc = RemoteCommand(
        pc_id=pc_id,
        command=event_type,
        params=json.dumps(payload),
        state="PENDING",
        issued_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        executed=False,
    )
    db.add(rc)
    db.commit()
    db.refresh(rc)

    # Also emit a system event so the admin UI (SSE) knows something happened
    event = SystemEvent(
        type=event_type,
        cafe_id=pc.cafe_id,
        pc_id=pc_id,
        payload=payload,
    )
    db.add(event)
    db.commit()
    return rc


# Client fetches the latest command (Long-Polling)
@router.post("/pull", response_model=list[RemoteCommandOut])
async def pull_commands(
    request: Request,
    timeout: int = 25,
    pc: ClientPC = Depends(get_current_device),
    db: Session = Depends(get_db),
):
    """
    MASTER SYSTEM: Long-poll for pending commands.
    Outbound HTTPS only. Reliable under NAT/Firewalls.
    """
    now = datetime.now(UTC)

    # CRITICAL FIX: Auto-expire stale PENDING commands on every pull.
    # This prevents old commands (e.g. logout sent hours ago) from executing
    # after a client restart or reinstall.
    stale = (
        db.query(RemoteCommand)
        .filter(
            RemoteCommand.pc_id == pc.id,
            RemoteCommand.state == "PENDING",
            RemoteCommand.expires_at <= now,
        )
        .all()
    )
    if stale:
        for s in stale:
            s.state = "EXPIRED"
        db.commit()

    start_time = now
    while (datetime.now(UTC) - start_time).total_seconds() < timeout:
        # MASTER SYSTEM: Multi-tenancy isolation enforced
        # Only return commands that haven't expired yet
        cmds = (
            db.query(RemoteCommand)
            .filter(
                RemoteCommand.pc_id == pc.id,
                RemoteCommand.state == "PENDING",
                RemoteCommand.expires_at > datetime.now(UTC),
            )
            .order_by(RemoteCommand.issued_at.asc())
            .all()
        )

        if cmds:
            for c in cmds:
                c.state = "DELIVERED"
            db.commit()
            return cmds

        await asyncio.sleep(1)  # Robust poll-and-sleep
        db.expire_all()

    return []  # Return empty list on timeout


# Client acknowledges command execution
@router.post("/ack")
async def ack_command(
    payload: dict, pc: ClientPC = Depends(get_current_device), db: Session = Depends(get_db)
):
    """
    MASTER SYSTEM: ACK required for every command.
    """
    cmd_id = payload.get("command_id")
    state = payload.get("state")  # RUNNING, SUCCEEDED, FAILED
    result = payload.get("result")

    rc = db.query(RemoteCommand).filter_by(id=cmd_id, pc_id=pc.id).first()
    if not rc:
        raise HTTPException(status_code=404, detail="Command not found for this device")

    rc.state = state
    rc.result = result
    rc.acknowledged_at = datetime.now(UTC)
    if state == "SUCCEEDED":
        rc.executed = True

    # If a shutdown/reboot command FAILED, revert PC status back to online
    if state == "FAILED" and rc.command in ("shutdown", "reboot", "restart"):
        pc.status = "online"
        revert_event = SystemEvent(
            type="pc.status",
            cafe_id=pc.cafe_id,
            pc_id=pc.id,
            payload={"status": "online"},
        )
        db.add(revert_event)

    # Emit System Event for Admin UI
    event = SystemEvent(
        type="command.ack",
        cafe_id=pc.cafe_id,
        pc_id=pc.id,
        payload={"command_id": rc.id, "state": state, "result": result},
    )
    db.add(event)
    db.commit()

    return {"status": "ok"}


# Admin can see history
@router.get("/history/{pc_id}", response_model=list[RemoteCommandOut])
def command_history(
    pc_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    cmds = (
        db.query(RemoteCommand)
        .filter_by(pc_id=pc_id)
        .order_by(RemoteCommand.issued_at.desc())
        .limit(50)
        .all()
    )
    return cmds
