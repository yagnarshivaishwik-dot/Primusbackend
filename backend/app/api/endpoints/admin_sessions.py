"""Admin session management: list active sessions, force logout by user or device."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import enforce_cafe_ownership
from app.auth.tokens import revoke_all_refresh_tokens
from app.database import get_db
from app.models import ClientPC, RefreshToken, User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/active")
def list_active_sessions(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """List all active (non-revoked, non-expired) sessions for the cafe."""
    now = datetime.now(UTC)
    query = db.query(RefreshToken).filter(
        RefreshToken.revoked == False,  # noqa: E712
        RefreshToken.expires_at > now,
    )
    if not ctx.is_superadmin and ctx.cafe_id:
        query = query.filter(RefreshToken.cafe_id == ctx.cafe_id)
    tokens = query.order_by(RefreshToken.issued_at.desc()).all()
    return [
        {
            "id": t.id,
            "user_id": t.user_id,
            "device_id": t.device_id,
            "cafe_id": t.cafe_id,
            "issued_at": t.issued_at.isoformat() if t.issued_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "ip_address": t.ip_address,
        }
        for t in tokens
    ]


@router.post("/force-logout/{user_id}")
def force_logout_user(
    user_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Revoke all refresh tokens for a user within the admin's cafe."""
    user = db.query(User).filter_by(id=user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    enforce_cafe_ownership(user, ctx)

    count = revoke_all_refresh_tokens(
        db,
        user_id=user_id,
        cafe_id=ctx.cafe_id if not ctx.is_superadmin else None,
    )
    logger.info("Force-logout user %d by admin %d: revoked %d tokens", user_id, current_user.id, count)
    return {"ok": True, "revoked": count}


@router.post("/force-logout-device/{device_id}")
def force_logout_device_session(
    device_id: str,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Revoke all refresh tokens bound to a specific device_id."""
    pc = db.query(ClientPC).filter(ClientPC.device_id == device_id).first()
    if pc:
        enforce_cafe_ownership(pc, ctx)

    count = db.query(RefreshToken).filter(
        RefreshToken.device_id == device_id,
        RefreshToken.revoked == False,  # noqa: E712
    ).update({"revoked": True, "revoked_at": datetime.now(UTC)})
    db.commit()
    logger.info("Force-logout device %s by admin %d: revoked %d tokens", device_id, current_user.id, count)
    return {"ok": True, "revoked": count}
