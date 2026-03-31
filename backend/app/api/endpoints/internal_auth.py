"""
Internal authentication endpoints for Super Admin portal.

These endpoints are specifically designed for the Super Admin web interface
and include additional security checks for privileged access.
"""


from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import (
    _normalize_password,
    authenticate_user,
    create_access_token,
    get_current_user,
    ph,
)
from app.db.dependencies import get_global_db as get_db
from app.models import User

router = APIRouter()


class InternalLoginRequest(BaseModel):
    username: str
    password: str


class InternalLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict
    must_change_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserProfileResponse(BaseModel):
    id: int
    email: str
    name: str | None
    role: str
    first_name: str | None = None
    last_name: str | None = None
    must_change_password: bool = False
    permissions: list[str] = []


# SuperAdmin role permissions
SUPERADMIN_PERMISSIONS = [
    "view_cafe_registry",
    "edit_cafe_details",
    "view_subscriptions",
    "modify_pricing",
    "view_financial_analytics",
    "export_reports",
    "trigger_invoices",
    "suspend_reactivate_cafes",
    "view_pc_health",
    "remote_pc_access",
    "execute_pc_commands",
    "view_audit_logs",
    "manage_users",
    "manage_permissions",
]

ADMIN_PERMISSIONS = [
    "view_cafe_registry",
    "view_subscriptions",
    "view_financial_analytics",
    "view_pc_health",
    "view_audit_logs",
]


def get_permissions_for_role(role: str) -> list[str]:
    """Get permissions list based on user role."""
    if role == "superadmin":
        return SUPERADMIN_PERMISSIONS
    elif role == "admin":
        return ADMIN_PERMISSIONS
    return []


@router.post("/login", response_model=InternalLoginResponse)
async def internal_login(
    payload: InternalLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Login endpoint for Super Admin portal.

    Only allows users with 'superadmin' or 'admin' roles.
    """
    user = authenticate_user(db, payload.username, payload.password)

    if not user:
        # Log failed login attempt
        log_action(
            db,
            None,
            "login_failed",
            f"Failed login attempt for: {payload.username}",
            str(request.client.host) if request.client else None,
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        )

    # Check if user has admin privileges
    if user.role not in ("superadmin", "admin"):
        log_action(
            db,
            user.id,
            "login_denied",
            f"Access denied - insufficient privileges for user: {user.email}",
            str(request.client.host) if request.client else None,
        )
        raise HTTPException(
            status_code=403,
            detail="Access denied. Super Admin privileges required.",
        )

    # Create access token
    token_data = {
        "sub": user.email,
        "role": user.role,
        "user_id": user.id,
    }
    access_token = create_access_token(data=token_data)

    # Log successful login
    log_action(
        db,
        user.id,
        "login_success",
        f"Super Admin login successful for: {user.email}",
        str(request.client.host) if request.client else None,
    )

    permissions = get_permissions_for_role(user.role)

    return InternalLoginResponse(
        access_token=access_token,
        user={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "permissions": permissions,
        },
        must_change_password=getattr(user, "must_change_password", False),
    )


@router.get("/me", response_model=UserProfileResponse)
async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current authenticated admin user profile.
    """
    if current_user.role not in ("superadmin", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Admin privileges required.",
        )

    permissions = get_permissions_for_role(current_user.role)

    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        must_change_password=getattr(current_user, "must_change_password", False),
        permissions=permissions,
    )


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change password for current user.
    """
    # Verify current password
    try:
        normalized_current = _normalize_password(payload.current_password)
        ph.verify(current_user.password_hash, normalized_current)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        ) from None

    # Validate new password
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password",
        )

    # Hash and save new password
    normalized_new = _normalize_password(payload.new_password)
    current_user.password_hash = ph.hash(normalized_new)

    # Clear must_change_password flag if set
    if hasattr(current_user, "must_change_password"):
        current_user.must_change_password = False

    db.commit()

    # Log password change
    log_action(
        db,
        current_user.id,
        "password_change",
        f"Password changed for user: {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Logout endpoint - logs the action for audit.

    Note: JWT tokens are stateless, so actual invalidation would require
    a token blacklist (not implemented here for simplicity).
    """
    log_action(
        db,
        current_user.id,
        "logout",
        f"User logged out: {current_user.email}",
        str(request.client.host) if request.client else None,
    )

    return {"message": "Logged out successfully"}
