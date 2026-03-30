from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import AuditLog
from app.schemas import AuditLogOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Utility: log an action (call from other endpoints!)
def log_action(
    db: Session,
    user_id: int | None,
    action: str,
    detail: str,
    ip: str | None = None,
    cafe_id: int | None = None,
    device_id: str | None = None,
) -> None:
    """
    Log an action to the audit log.

    This function should be called for all sensitive operations including:
    - User management (create, update, delete)
    - Wallet operations (topup, deduct, transactions)
    - Payment processing
    - Remote commands
    - Webhook changes
    - Settings changes
    - Authentication events (login, logout, password reset)

    Args:
        db: Database session
        user_id: ID of user performing the action (None for system actions)
        action: Action name (e.g., 'user_create', 'wallet_topup', 'pc_command')
        detail: Detailed description of the action
        ip: IP address of the requester (optional)

    Returns:
        None (raises exception on failure, but should not fail the main operation)
    """
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            detail=(
                detail[:1000] if detail and len(detail) > 1000 else detail
            ),  # Limit detail length
            ip=ip,
            cafe_id=cafe_id,
            device_id=device_id,
            timestamp=datetime.now(UTC),
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        # Don't fail the main operation if audit logging fails
        # But log the error for debugging
        import logging

        logging.error(f"Failed to log audit action {action}: {e}")
        # Try to rollback the audit entry addition
        try:
            db.rollback()
        except Exception:
            pass


# List logs (admin only)
@router.get("/", response_model=list[AuditLogOut])
def list_logs(
    start: str | None = None,
    end: str | None = None,
    category: str | None = None,
    pc: str | None = None,
    employee: str | None = None,
    user: str | None = None,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    from datetime import datetime as _dt

    if start:
        try:
            q = q.filter(AuditLog.timestamp >= _dt.fromisoformat(start))
        except Exception:
            # Ignore invalid date formats in filters
            pass
    if end:
        try:
            q = q.filter(AuditLog.timestamp <= _dt.fromisoformat(end))
        except Exception:
            # Ignore invalid date formats in filters
            pass
    if category:
        q = q.filter(AuditLog.action.ilike(f"%{category}%"))
    if user:
        # naive: search in detail or require user_id match if numeric
        try:
            uid = int(user)
            q = q.filter(AuditLog.user_id == uid)
        except ValueError:
            q = q.filter(AuditLog.detail.ilike(f"%{user}%"))
    # pc/employee filters can be encoded in detail for now
    if pc:
        q = q.filter(AuditLog.detail.ilike(f"%PC:{pc}%"))
    if employee:
        q = q.filter(AuditLog.detail.ilike(f"%Employee:{employee}%"))
    logs = q.order_by(AuditLog.timestamp.desc()).limit(1000).all()
    return logs


# (Optional) Get user-specific logs
@router.get("/user/{user_id}", response_model=list[AuditLogOut])
def user_logs(
    user_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    logs = (
        db.query(AuditLog)
        .filter_by(user_id=user_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(100)
        .all()
    )
    return logs


# Client-originated audit log (auth optional; prefer with JWT)
@router.post("/client")
def client_log(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    try:
        action = payload.get("action")
        detail = payload.get("detail")
        if not action:
            raise HTTPException(status_code=400, detail="action required")
        uid = getattr(current_user, "id", None)
        log_action(db, uid, action, detail or "", ip=str(request.client.host))
        return {"status": "ok"}
    except HTTPException:
        # Re-raise HTTP exceptions unchanged
        raise
    except Exception as err:
        # Wrap unexpected errors in a generic HTTPException while preserving traceback
        raise HTTPException(status_code=400, detail="invalid payload") from err
