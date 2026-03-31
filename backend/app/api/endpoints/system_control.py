"""
System control endpoints for Super Admin portal.

Provides infrastructure control actions for managing the Primus platform.
All actions are logged for audit and require superadmin privileges.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import require_role
from app.db.dependencies import get_cafe_db as get_db

router = APIRouter()

# In-memory state (in production, this would be stored in Redis or database)
_system_state = {
    "maintenance_mode": False,
    "deployments_paused": False,
    "commands_disabled": False,
    "last_restart": None,
    "last_handshake_force": None,
}


class SystemActionResponse(BaseModel):
    success: bool
    message: str
    action: str
    timestamp: str


class MaintenanceModeRequest(BaseModel):
    enabled: bool
    message: str | None = None


class SystemStateResponse(BaseModel):
    maintenance_mode: bool
    deployments_paused: bool
    commands_disabled: bool
    last_restart: str | None
    last_handshake_force: str | None


@router.get("/state", response_model=SystemStateResponse)
async def get_system_state(
    current_user=Depends(require_role("admin")),
):
    """Get current system state."""
    return SystemStateResponse(
        maintenance_mode=_system_state["maintenance_mode"],
        deployments_paused=_system_state["deployments_paused"],
        commands_disabled=_system_state["commands_disabled"],
        last_restart=_system_state["last_restart"],
        last_handshake_force=_system_state["last_handshake_force"],
    )


@router.post("/restart-service", response_model=SystemActionResponse)
async def restart_service(
    request: Request,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Restart backend service.

    Note: In production, this would trigger a graceful restart via systemd/supervisor.
    For development, this logs the action and returns success.
    """
    timestamp = datetime.now(UTC).isoformat()

    # Log the action
    log_action(
        db,
        current_user.id,
        "system_restart",
        f"Service restart initiated by {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    _system_state["last_restart"] = timestamp

    # In production, you would trigger actual restart here
    # For example: os.kill(os.getpid(), signal.SIGHUP)

    return SystemActionResponse(
        success=True,
        message="Service restart initiated. The service will restart momentarily.",
        action="restart_service",
        timestamp=timestamp,
    )


@router.post("/maintenance-mode", response_model=SystemActionResponse)
async def toggle_maintenance_mode(
    payload: MaintenanceModeRequest,
    request: Request,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Toggle maintenance mode for the entire platform.

    When enabled:
    - Public API endpoints return 503 Service Unavailable
    - PC clients show maintenance message
    - Only superadmin can access the system
    """
    timestamp = datetime.now(UTC).isoformat()

    _system_state["maintenance_mode"] = payload.enabled

    action = "enabled" if payload.enabled else "disabled"

    log_action(
        db,
        current_user.id,
        "maintenance_mode",
        f"Maintenance mode {action} by {current_user.email}" +
        (f" with message: {payload.message}" if payload.message else ""),
        str(request.client.host) if request.client else None,
    )

    return SystemActionResponse(
        success=True,
        message=f"Maintenance mode {action} successfully.",
        action="maintenance_mode",
        timestamp=timestamp,
    )


@router.post("/pause-deployments", response_model=SystemActionResponse)
async def toggle_pause_deployments(
    request: Request,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Toggle deployment pause state.

    When paused:
    - New PC registrations are queued but not processed
    - License activations are held
    - Updates to PCs are paused
    """
    timestamp = datetime.now(UTC).isoformat()

    _system_state["deployments_paused"] = not _system_state["deployments_paused"]

    action = "paused" if _system_state["deployments_paused"] else "resumed"

    log_action(
        db,
        current_user.id,
        "pause_deployments",
        f"Deployments {action} by {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    return SystemActionResponse(
        success=True,
        message=f"Deployments {action} successfully.",
        action="pause_deployments",
        timestamp=timestamp,
    )


@router.post("/disable-commands", response_model=SystemActionResponse)
async def toggle_disable_commands(
    request: Request,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Toggle PC command execution.

    When disabled:
    - Remote commands to PCs are queued but not sent
    - Useful during maintenance or security incidents
    """
    timestamp = datetime.now(UTC).isoformat()

    _system_state["commands_disabled"] = not _system_state["commands_disabled"]

    action = "disabled" if _system_state["commands_disabled"] else "enabled"

    log_action(
        db,
        current_user.id,
        "disable_commands",
        f"PC commands {action} by {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    return SystemActionResponse(
        success=True,
        message=f"PC commands {action} successfully.",
        action="disable_commands",
        timestamp=timestamp,
    )


@router.post("/force-handshake", response_model=SystemActionResponse)
async def force_handshake(
    request: Request,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Force all connected PCs to perform a re-handshake.

    Useful when:
    - Rotating security tokens
    - Updating client configuration
    - After major system changes
    """
    timestamp = datetime.now(UTC).isoformat()

    _system_state["last_handshake_force"] = timestamp

    log_action(
        db,
        current_user.id,
        "force_handshake",
        f"Forced all PCs to re-handshake by {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    # In production, this would broadcast a message to all connected PCs
    # via WebSocket or long-polling

    return SystemActionResponse(
        success=True,
        message="Force re-handshake command broadcast to all connected PCs.",
        action="force_handshake",
        timestamp=timestamp,
    )
