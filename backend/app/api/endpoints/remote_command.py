import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.api.endpoints.client_pc import get_current_device
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.database import get_db
from app.models import ClientPC, RemoteCommand, SystemEvent
from app.schemas import RemoteCommandIn, RemoteCommandOut
from app.ws.pc import notify_pc

logger = logging.getLogger(__name__)

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
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    _validate_command_params(cmd.command, cmd.params)

    pc = db.query(ClientPC).filter_by(id=cmd.pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    enforce_cafe_ownership(pc, ctx)

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

    logger.info(
        "[CMD SEND] Command #%d created: %s for PC #%d (expires %s)",
        rc.id, rc.command, rc.pc_id, rc.expires_at.isoformat(),
    )

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
        logger.info("[CMD PUSH] Command #%d pushed via WebSocket to PC #%d", rc.id, rc.pc_id)
    except Exception as exc:
        logger.warning(
            "[CMD PUSH] WebSocket push failed for command #%d to PC #%d: %s — will rely on HTTP polling",
            rc.id, rc.pc_id, exc,
        )

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

    logger.debug("[CMD PULL] PC #%d polling for commands (timeout=%ds)", pc.id, timeout)

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
            logger.info(
                "[CMD PULL] Delivered %d command(s) to PC #%d: %s",
                len(cmds), pc.id,
                ", ".join(f"#{c.id}({c.command})" for c in cmds),
            )
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

    logger.info(
        "[CMD ACK] Command #%d (%s) on PC #%d → %s (result=%s)",
        rc.id, rc.command, pc.id, state, result,
    )

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
    pc_id: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    # Verify the PC belongs to this admin's cafe
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)

    cmds = (
        db.query(RemoteCommand)
        .filter_by(pc_id=pc_id)
        .order_by(RemoteCommand.issued_at.desc())
        .limit(50)
        .all()
    )
    return cmds


# Diagnostic endpoint: shows command pipeline state for a PC
@router.get("/debug/{pc_id}")
def command_debug(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Diagnostic endpoint to check command delivery pipeline for a PC.
    Shows pending/delivered/stuck commands and WebSocket connection status.
    """
    from app.ws.pc import _pc_connections

    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    enforce_cafe_ownership(pc, ctx)

    now = datetime.now(UTC)

    pending = (
        db.query(RemoteCommand)
        .filter(RemoteCommand.pc_id == pc_id, RemoteCommand.state == "PENDING")
        .all()
    )
    delivered = (
        db.query(RemoteCommand)
        .filter(RemoteCommand.pc_id == pc_id, RemoteCommand.state == "DELIVERED")
        .all()
    )
    recent_expired = (
        db.query(RemoteCommand)
        .filter(RemoteCommand.pc_id == pc_id, RemoteCommand.state == "EXPIRED")
        .order_by(RemoteCommand.issued_at.desc())
        .limit(5)
        .all()
    )
    recent_succeeded = (
        db.query(RemoteCommand)
        .filter(RemoteCommand.pc_id == pc_id, RemoteCommand.state == "SUCCEEDED")
        .order_by(RemoteCommand.acknowledged_at.desc())
        .limit(5)
        .all()
    )

    ws_conns = _pc_connections.get(pc_id, [])

    return {
        "pc_id": pc_id,
        "pc_status": pc.status,
        "pc_last_seen": pc.last_seen.isoformat() if pc.last_seen else None,
        "websocket_connections": len(ws_conns),
        "pending_commands": [
            {"id": c.id, "command": c.command, "issued_at": c.issued_at.isoformat(),
             "expires_at": c.expires_at.isoformat() if c.expires_at else None,
             "age_seconds": (now - c.issued_at).total_seconds()}
            for c in pending
        ],
        "delivered_but_unacked": [
            {"id": c.id, "command": c.command, "issued_at": c.issued_at.isoformat(),
             "age_seconds": (now - c.issued_at).total_seconds()}
            for c in delivered
        ],
        "recent_expired": [
            {"id": c.id, "command": c.command, "issued_at": c.issued_at.isoformat()}
            for c in recent_expired
        ],
        "recent_succeeded": [
            {"id": c.id, "command": c.command,
             "acknowledged_at": c.acknowledged_at.isoformat() if c.acknowledged_at else None}
            for c in recent_succeeded
        ],
        "diagnosis": _diagnose(pc, ws_conns, pending, delivered, recent_expired),
    }


def _diagnose(pc, ws_conns, pending, delivered, recent_expired):
    """Generate human-readable diagnosis of command pipeline issues."""
    issues = []

    if not ws_conns:
        issues.append("NO_WS_CONNECTION: No active WebSocket — commands rely on HTTP polling only")

    if pending:
        issues.append(
            f"COMMANDS_STUCK_PENDING: {len(pending)} command(s) waiting — "
            "client is NOT polling /command/pull or poll is failing"
        )

    if delivered:
        issues.append(
            f"COMMANDS_STUCK_DELIVERED: {len(delivered)} command(s) delivered but never ACKed — "
            "client received but failed to execute or ACK"
        )

    if recent_expired and not pending and not delivered:
        issues.append(
            "COMMANDS_EXPIRING: Recent commands expired before client picked them up — "
            "client may not be running command service"
        )

    if pc.status == "offline":
        issues.append("PC_OFFLINE: PC is marked offline — no heartbeats received")

    if not issues:
        issues.append("OK: Pipeline looks healthy — no stuck or expired commands")

    return issues
