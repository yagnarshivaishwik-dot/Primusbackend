import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.database import get_db
from app.models import PC, RemoteCommand
from app.schemas import RemoteCommandIn, RemoteCommandOut
from app.ws.pc import notify_pc

router = APIRouter()

# Allowed remote commands - prevent command injection
ALLOWED_COMMANDS = [
    "shutdown",
    "restart",
    "lock",
    "unlock",
    "message",
    "screenshot",
    "update",
]


def _validate_command_params(command: str, params: str | None) -> None:
    """Validate command and parameters to prevent injection attacks."""
    if command not in ALLOWED_COMMANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid command '{command}'. Allowed commands: {', '.join(ALLOWED_COMMANDS)}",
        )

    # Validate params based on command type
    if params:
        # Ensure params is a string (will be JSON parsed by client)
        if not isinstance(params, str):
            raise HTTPException(status_code=400, detail="Params must be a JSON string")

        # Basic length check to prevent DoS
        if len(params) > 10000:  # 10KB max
            raise HTTPException(status_code=400, detail="Params too large (max 10KB)")


# Admin sends a command to a PC
@router.post("/send", response_model=RemoteCommandOut)
async def send_command(
    cmd: RemoteCommandIn,
    current_user=Depends(require_role("admin")),  # Require admin role
    db: Session = Depends(get_db),
):
    # Validate command and parameters
    _validate_command_params(cmd.command, cmd.params)

    pc = db.query(PC).filter_by(id=cmd.pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    rc = RemoteCommand(
        pc_id=cmd.pc_id,
        command=cmd.command,
        params=cmd.params,
        issued_at=datetime.now(UTC),
        executed=False,
    )
    db.add(rc)
    db.commit()
    db.refresh(rc)
    try:
        log_action(
            db,
            getattr(current_user, "id", None),
            f"pc_command:{cmd.command}",
            f"PC:{cmd.pc_id} params:{cmd.params}",
            None,
        )
    except Exception:
        pass
    # Push to PC websocket (best-effort)
    try:
        payload = json.dumps({"pc_id": cmd.pc_id, "command": cmd.command, "params": cmd.params})
        await notify_pc(cmd.pc_id, payload)
    except Exception:
        pass
    return rc


# Client fetches the latest command (and marks it executed)
@router.post("/fetch", response_model=RemoteCommandOut | None)
def fetch_command(pc_id: int, db: Session = Depends(get_db)):
    rc = (
        db.query(RemoteCommand)
        .filter_by(pc_id=pc_id, executed=False)
        .order_by(RemoteCommand.issued_at.desc())
        .first()
    )
    if rc:
        rc.executed = True
        db.commit()
        db.refresh(rc)
        return rc
    return None


# Admin can see history (optional)
@router.get("/history/{pc_id}", response_model=list[RemoteCommandOut])
def command_history(
    pc_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    cmds = (
        db.query(RemoteCommand)
        .filter_by(pc_id=pc_id)
        .order_by(RemoteCommand.issued_at.desc())
        .all()
    )
    return cmds
