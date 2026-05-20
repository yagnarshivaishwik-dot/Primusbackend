"""AuthContext: enriched authentication context with tenant + device info."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app.db.dependencies import get_global_db as get_db
from app.models import User

# Role hierarchy for permission checks
ROLE_HIERARCHY: dict[str, int] = {
    "superadmin": 100,
    "cafeadmin": 80,
    "admin": 80,  # alias for cafeadmin (backwards compat)
    "owner": 80,  # alias for cafeadmin
    "staff": 40,
    "client": 10,
}


@dataclass
class AuthContext:
    """Authenticated request context with tenant and device information."""

    user: User
    user_id: int
    cafe_id: int | None
    device_id: str | None
    role: str
    ip_address: str | None

    @property
    def is_superadmin(self) -> bool:
        return self.role == "superadmin"

    def has_role(self, required_role: str) -> bool:
        """Check if user's role meets or exceeds the required role level."""
        user_level = ROLE_HIERARCHY.get(self.role, 0)
        required_level = ROLE_HIERARCHY.get(required_role, 0)
        return user_level >= required_level


async def get_auth_context(
    request: Request,
    db: DBSession = Depends(get_db),
) -> AuthContext:
    """Extract enriched auth context from JWT token.

    Supports both new enriched tokens (with cafe_id, device_id, role)
    and legacy tokens (with only sub=email). Falls back gracefully.

    Phase 1: this is now async so we can consult the Redis-backed jti
    revocation store. The revocation check rejects tokens that have been
    explicitly killed by force-logout even if they would otherwise be
    valid by signature + exp.
    """
    from app.auth.tokens import decode_access_token_async
    from app.utils.jwt_revocation import is_revoked as _jti_is_revoked

    # Get raw token
    token = _extract_token(request)
    if token is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Try enriched token first (this also checks jti revocation).
    claims = await decode_access_token_async(token)
    if claims and claims.get("user_id"):
        user = db.query(User).filter(User.id == claims["user_id"]).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")

        resolved_cafe_id = claims.get("cafe_id") or user.cafe_id

        # If still None, resolve from UserCafeMap (primary mapping first)
        if resolved_cafe_id is None:
            from app.models import UserCafeMap
            mapping = (
                db.query(UserCafeMap)
                .filter(UserCafeMap.user_id == user.id)
                .order_by(UserCafeMap.is_primary.desc())
                .first()
            )
            if mapping:
                resolved_cafe_id = mapping.cafe_id

        # Last-resort fallback: kiosk-side license_key. Customers signing
        # up at a kiosk often don't have cafe_id set on their User record
        # yet (the public /register endpoint can't know which cafe they're
        # at). The React clutchh client sends X-License-Key on every
        # request, and the License table maps key -> cafe_id. Without this
        # fallback, /api/v1/shop/client/packs and similar customer-facing
        # endpoints return empty because ctx.cafe_id is None.
        if resolved_cafe_id is None:
            license_key = request.headers.get("X-License-Key")
            if license_key:
                from app.models import License
                lic = db.query(License).filter_by(key=license_key).first()
                if lic and lic.cafe_id is not None:
                    resolved_cafe_id = int(lic.cafe_id)

        ctx = AuthContext(
            user=user,
            user_id=user.id,
            cafe_id=resolved_cafe_id,
            device_id=claims.get("device_id"),
            role=claims.get("role", user.role),
            ip_address=request.client.host if request.client else None,
        )
        # Store on request.state for RLS tenant context injection
        request.state.user_id = ctx.user_id
        request.state.user_role = ctx.role
        request.state.cafe_id = ctx.cafe_id
        return ctx

    # Fallback: legacy token with just "sub" (email). These are tokens minted
    # before Phase 1 added jti claims. Honor JWT_SECRET_PREVIOUS so the soft
    # rotation grace window also covers legacy tokens.
    from app.auth.tokens import _decode_with_keys  # internal helper

    payload = _decode_with_keys(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    email = payload.get("sub")
    if email is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Even legacy tokens can have a jti if they were re-issued during rolling
    # deploy. Check revocation defensively.
    legacy_jti = payload.get("jti")
    if legacy_jti and await _jti_is_revoked(legacy_jti):
        raise HTTPException(status_code=401, detail="Token revoked")

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    resolved_cafe_id = user.cafe_id
    resolved_role = user.role

    # If cafe_id is not on the user record, try UserCafeMap (primary mapping first)
    if resolved_cafe_id is None:
        from app.models import UserCafeMap
        mapping = (
            db.query(UserCafeMap)
            .filter(UserCafeMap.user_id == user.id)
            .order_by(UserCafeMap.is_primary.desc())
            .first()
        )
        if mapping:
            resolved_cafe_id = mapping.cafe_id
            resolved_role = mapping.role or resolved_role

    # Same X-License-Key fallback as the enriched-token branch above.
    if resolved_cafe_id is None:
        license_key = request.headers.get("X-License-Key")
        if license_key:
            from app.models import License
            lic = db.query(License).filter_by(key=license_key).first()
            if lic and lic.cafe_id is not None:
                resolved_cafe_id = int(lic.cafe_id)

    ctx = AuthContext(
        user=user,
        user_id=user.id,
        cafe_id=resolved_cafe_id,
        device_id=None,
        role=resolved_role,
        ip_address=request.client.host if request.client else None,
    )
    # Store on request.state for RLS tenant context injection
    request.state.user_id = ctx.user_id
    request.state.user_role = ctx.role
    request.state.cafe_id = ctx.cafe_id
    return ctx


def _extract_token(request: Request) -> str | None:
    """Extract JWT token from cookie or Authorization header."""
    # 1. Check httpOnly cookie
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        if cookie_token.startswith("Bearer "):
            return cookie_token.split(" ")[1]
        return cookie_token

    # 2. Check Authorization header
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]

    return None


def require_role(*roles: str):
    """Enhanced role check dependency supporting hierarchy and multiple roles.

    Usage:
        @router.get("/admin")
        def admin_only(ctx: AuthContext = Depends(require_role("admin"))):
            ...

        @router.get("/staff-or-admin")
        def staff_or_admin(ctx: AuthContext = Depends(require_role("staff", "admin"))):
            ...

    Phase 1: now async because get_auth_context is async (jti revocation check).
    """

    async def role_checker(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        # Superadmin bypasses all role checks
        if ctx.is_superadmin:
            return ctx

        # Check if user's role meets any of the required roles
        for required in roles:
            if ctx.has_role(required):
                return ctx

        raise HTTPException(status_code=403, detail="Not enough permissions")

    return role_checker
