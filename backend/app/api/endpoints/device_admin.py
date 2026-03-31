"""Device administration endpoints: list, revoke, approve, IP range, IP history."""

import ipaddress
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import enforce_cafe_ownership, scoped_query
from app.db.dependencies import get_cafe_db as get_db
from app.models import ClientPC, DeviceIpHistory, RefreshToken

logger = logging.getLogger(__name__)
router = APIRouter()


class IpRangeUpdate(BaseModel):
    allowed_ip_range: str | None = None  # CIDR e.g. "192.168.1.0/24" or None to clear


@router.get("/")
def list_devices(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """List all devices (PCs) for the authenticated cafe."""
    devices = scoped_query(db, ClientPC, ctx).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "device_id": d.device_id,
            "status": d.status,
            "device_status": getattr(d, "device_status", "active") or "active",
            "ip_address": d.ip_address,
            "allowed_ip_range": getattr(d, "allowed_ip_range", None),
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            "cafe_id": d.cafe_id,
        }
        for d in devices
    ]


@router.post("/{pc_id}/revoke")
def revoke_device(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Revoke a device — it will be rejected on all future requests."""
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)
    pc.device_status = "revoked"
    db.commit()
    logger.info("Device %d revoked by admin %d (cafe=%s)", pc_id, current_user.id, ctx.cafe_id)
    return {"ok": True, "device_status": "revoked"}


@router.post("/{pc_id}/approve")
def approve_device(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Approve a pending device, setting its status to active."""
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)
    pc.device_status = "active"
    db.commit()
    return {"ok": True, "device_status": "active"}


@router.put("/{pc_id}/ip-range")
def set_ip_range(
    pc_id: int,
    body: IpRangeUpdate,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Set allowed IP range (CIDR) for a device. Pass null to remove restriction."""
    if body.allowed_ip_range:
        try:
            ipaddress.ip_network(body.allowed_ip_range, strict=False)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid CIDR notation")
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)
    pc.allowed_ip_range = body.allowed_ip_range
    db.commit()
    return {"ok": True, "allowed_ip_range": pc.allowed_ip_range}


@router.get("/{pc_id}/ip-history")
def get_ip_history(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """View historical IP addresses for a device."""
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)
    history = (
        db.query(DeviceIpHistory)
        .filter_by(client_pc_id=pc_id)
        .order_by(DeviceIpHistory.last_seen.desc())
        .all()
    )
    return [
        {
            "ip_address": h.ip_address,
            "first_seen": h.first_seen.isoformat() if h.first_seen else None,
            "last_seen": h.last_seen.isoformat() if h.last_seen else None,
            "request_count": h.request_count,
        }
        for h in history
    ]


@router.post("/{pc_id}/force-logout")
def force_logout_device(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Revoke all refresh tokens bound to this device's device_id."""
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    enforce_cafe_ownership(pc, ctx)
    if not pc.device_id:
        return {"ok": True, "revoked": 0}
    count = db.query(RefreshToken).filter(
        RefreshToken.device_id == pc.device_id,
        RefreshToken.revoked == False,  # noqa: E712
    ).update({"revoked": True, "revoked_at": datetime.now(UTC)})
    db.commit()
    return {"ok": True, "revoked": count}
