import logging
import secrets
from datetime import UTC, datetime, timedelta

import httpx
import pyotp
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt.exceptions import PyJWTError as JWTError
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.api.dependencies.rate_limit import (
    FORGOT_LIMIT,
    LOGIN_LIMIT,
    OTP_REQUEST_LIMIT,
    OTP_VERIFY_LIMIT,
    PASSWORD_CHANGE_LIMIT,
    REGISTER_LIMIT,
)
from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    ENABLE_TOTP_2FA,
    JWT_SECRET,
    OIDC_AUDIENCE,
    OIDC_ISSUER,
)
from app.db.dependencies import get_global_db as get_db
from app.models import User
from app.schemas import UserOut, UserUpdate
from app.utils.jwt_revocation import new_jti as _new_jti
from app.utils.passwords import (
    authenticate_and_maybe_rehash as _authenticate_and_maybe_rehash,
    hash_password as _hash_password_v2,
    verify_password as _verify_password_v2,
)
from app.utils.security import validate_password_strength

# ---- Backward-compatible re-exports ----
# Phase 1 password handling (commit utils/passwords.py) moved the Argon2id
# hasher and the legacy SHA-256 normaliser out of this module. Several
# callers still import them from the OLD location:
#
#   from app.api.endpoints.auth import _normalize_password, ph
#       — utils/onboarding.py, endpoints/staff.py, endpoints/user.py,
#         endpoints/internal_auth.py
#
# When the rebuild lacked these names the container crashed with
# `ImportError: cannot import name '_normalize_password' from
# 'app.api.endpoints.auth'` BEFORE main.py finished loading. Re-export
# under the legacy names so the import path keeps working without
# touching every caller. Migrating those callers to the new public API
# (hash_password / verify_password) is a follow-up cleanup, not a
# deploy-blocker.
from app.utils.passwords import (  # noqa: E402  (intentional re-export)
    _hasher as ph,
    _legacy_sha256_normalized as _normalize_password,
)


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """Backward-compat sync wrapper around the async fastapi-mail sender.

    Lazy callers (e.g. app/utils/otp_v2.py:196) still do
        from app.api.endpoints.auth import send_email
    expecting the legacy 3-arg sync signature. Forward to the real
    sender in app.utils.email — fire-and-forget when an event loop is
    already running (caller is sync, won't await), otherwise run to
    completion in a fresh loop.
    """
    import asyncio

    from app.utils.email import send_email as _send_async

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    coro = _send_async([to_email], subject, html_body)
    if loop is not None:
        asyncio.ensure_future(coro)
    else:
        try:
            asyncio.run(coro)
        except Exception:  # pragma: no cover - best-effort
            pass

router = APIRouter()

logger = logging.getLogger(__name__)

# ---- JWT Settings ----
# Use centralized config with fail-fast validation

## Firebase login disabled in this configuration

# ---- Custom OAuth2 Dependency (Cookie + Header) ----
# Standard OAuth2PasswordBearer only checks Authorization header.
# We need to check the 'access_token' httpOnly cookie first (more secure),
# then fall back to the header (for mobile/API clients).

oauth2_scheme_header = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
oauth2_scheme = oauth2_scheme_header

async def get_token(
    request: Request,
    token_header: str | None = Depends(oauth2_scheme_header)
) -> str:
    # 1. Check Cookie (Preferred)
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        # Cookie format might be "Bearer <token>" or just "<token>"
        if cookie_token.startswith("Bearer "):
            return cookie_token.split(" ")[1]
        return cookie_token

    # 2. Check Header
    if token_header:
        return token_header

    raise HTTPException(status_code=401, detail="Not authenticated")


# ---- JWT Authentication Dependency ----
def get_current_user(token: str = Depends(get_token), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc
    
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
        
    # Ensure user object is fully loaded
    _ = user.id, user.email, user.role, user.wallet_balance
    return user


# ---- Role-based Dependency ----
def require_role(role: str):
    """
    Create a dependency that requires a specific role (or higher in the hierarchy).

    Delegates to app.auth.context.require_role for unified role-hierarchy checking
    (superadmin > cafeadmin/admin/owner > staff > client), then unwraps the
    AuthContext back to a plain User object so all existing endpoints keep working
    without changes.

    Args:
        role: Minimum required role name (e.g., 'admin', 'staff', 'client')

    Returns:
        Dependency function that checks user role and returns the User object.
    """
    from app.auth.context import require_role as _ctx_require_role

    _ctx_checker = _ctx_require_role(role)

    def role_checker(ctx=Depends(_ctx_checker)) -> User:
        return ctx.user

    return role_checker


## Registration: simple name/email/password


# ---- Authenticate Helper ----
#
# Phase 1: password verification is now delegated to app.utils.passwords,
# which removes the SHA-256 pre-hash (audit BE-H2 / SEC-H2) and supports a
# rolling migration from any of {modern Argon2id, legacy Argon2id-of-SHA256,
# bcrypt, bare SHA-256 hex}. On a successful match against any legacy
# format, the user's password_hash is rewritten to the modern format in the
# same DB transaction — no forced password reset for legacy users.

def authenticate_user(db, email_or_username, password):
    """Verify credentials and rolling-migrate the hash on success."""
    user = (
        db.query(User)
        .filter((User.email == email_or_username) | (User.name == email_or_username))
        .first()
    )
    if not user:
        # Constant-ish work even on miss — verify against a dummy hash so the
        # response time of "no such user" matches "wrong password". This is a
        # cheap mitigation against username enumeration via timing.
        try:
            _verify_password_v2(password, "$argon2id$v=19$m=65536,t=3,p=2$unused$"
                                          "0000000000000000000000000000000000000000000")
        except Exception:
            pass
        return None

    def _persist_new_hash(new_hash: str) -> None:
        user.password_hash = new_hash
        db.add(user)
        db.commit()

    if _authenticate_and_maybe_rehash(password, user.password_hash, on_rehash=_persist_new_hash):
        return user
    return None


# ---- JWT Token Creation ----
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token (legacy data-dict signature).

    Phase 1 changes:
      - Always sets `type: "access"` so this token cannot be confused with a
        refresh token by decode_access_token().
      - Always sets `jti` (random per-token id) so the token can be revoked
        via the Redis revocation store. Callers that already supplied a
        jti in `data` are honored.
      - Always sets `iat` (issued-at).

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.setdefault("type", "access")
    to_encode.setdefault("jti", _new_jti())
    to_encode.setdefault("iat", datetime.now(UTC))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)


async def _decode_oidc_token(token: str) -> dict:
    """
    Decode and validate an OIDC token against a JWKS from the configured issuer.

    This is designed for integration with Keycloak or any OIDC provider exposing
    JWKS at the standard certs endpoint.
    """
    if not OIDC_ISSUER or not OIDC_AUDIENCE:
        raise HTTPException(status_code=503, detail="OIDC is not configured")

    jwks_url = f"{OIDC_ISSUER.rstrip('/')}/protocol/openid-connect/certs"
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        jwks = resp.json()

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=401, detail="Invalid token header") from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Missing key ID in token")

    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        raise HTTPException(status_code=401, detail="Unable to find matching JWKS key")

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[header.get("alg", "RS256")],
            audience=OIDC_AUDIENCE,
            issuer=OIDC_ISSUER,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid OIDC token") from exc
    return payload


async def get_current_user_oidc(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependency to validate an external OIDC token and return its claims.

    This does not map to a local User record; it is intended for direct OIDC integration.
    """
    return await _decode_oidc_token(token)


# ---- LOGIN ENDPOINT (HttpOnly Cookie) ----
@router.post("/login")
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    _rate_limited: None = Depends(LOGIN_LIMIT),
):
    """authenticate user and set HttpOnly cookie."""
    from fastapi import Response
    from app.utils.account_lockout import (
        clear_login_attempts,
        is_account_locked,
        record_failed_login_attempt,
    )

    email = form_data.username.lower().strip()
    client_ip = str(request.client.host) if request and request.client else None

    # Check lock status
    locked, seconds_remaining = is_account_locked(email)
    if locked:
        minutes_remaining = int(seconds_remaining / 60) + 1
        raise HTTPException(
            status_code=423,
            detail=f"Account locked. Try again in {minutes_remaining} minute(s).",
        )

    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        record_failed_login_attempt(email)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 2FA Check
    if ENABLE_TOTP_2FA and user.two_factor_secret:
        form = await request.form()
        totp_code = form.get("totp_code")
        if not totp_code:
            record_failed_login_attempt(email)
            raise HTTPException(status_code=401, detail="TOTP code required")
        totp = pyotp.TOTP(user.two_factor_secret)
        if not totp.verify(totp_code, valid_window=1):
            record_failed_login_attempt(email)
            raise HTTPException(status_code=401, detail="Invalid TOTP code")

    clear_login_attempts(email)

    # Audit Log
    try:
        from app.api.endpoints.audit import log_action
        log_action(db, user.id, "login_success", f"Email:{email}", client_ip)
        
        # Trial logic
        if user.role == "admin" and user.cafe_id:
            from app.models import License
            license_obj = db.query(License).filter_by(cafe_id=user.cafe_id).first()
            if license_obj and not license_obj.activated_at:
                license_obj.activated_at = datetime.now(UTC)
                license_obj.expires_at = license_obj.activated_at + timedelta(days=30)
                db.add(license_obj)
                db.commit()
    except Exception:
        pass

    # ---- Device-based cafe resolution ----
    from app.auth.tokens import (
        create_access_token as create_enriched_token,
        create_refresh_token,
    )
    from app.models import ClientPC, UserCafeMap
    from app.config import REQUIRE_DEVICE_ID_ON_LOGIN

    # Extract device_id from form data (optional for backwards compat)
    form = await request.form()
    device_id = form.get("device_id")
    resolved_cafe_id = user.cafe_id
    resolved_role = user.role

    if device_id:
        # Resolve cafe from device
        device = db.query(ClientPC).filter(ClientPC.device_id == device_id).first()
        if device is None:
            raise HTTPException(status_code=400, detail="Unknown device")
        if getattr(device, "device_status", "active") == "revoked":
            raise HTTPException(status_code=403, detail="Device has been revoked")

        resolved_cafe_id = device.cafe_id

        # Validate user has access to this cafe
        mapping = (
            db.query(UserCafeMap)
            .filter(UserCafeMap.user_id == user.id, UserCafeMap.cafe_id == resolved_cafe_id)
            .first()
        )
        if mapping:
            resolved_role = mapping.role
        elif user.cafe_id == resolved_cafe_id:
            resolved_role = user.role
        elif user.role == "superadmin":
            resolved_role = "superadmin"
        else:
            raise HTTPException(
                status_code=403,
                detail="User does not have access to this cafe",
            )
    elif REQUIRE_DEVICE_ID_ON_LOGIN:
        raise HTTPException(status_code=400, detail="device_id is required for login")

    # ---- Concurrent cafe session guard ----
    # Prevent client-role users from being logged in at multiple cafes simultaneously.
    # Admins/staff are exempt (they may legitimately manage multiple cafes).
    if resolved_role == "client" and resolved_cafe_id is not None:
        from app.models import RefreshToken as RefreshTokenModel, Cafe
        active_elsewhere = (
            db.query(RefreshTokenModel)
            .filter(
                RefreshTokenModel.user_id == user.id,
                RefreshTokenModel.revoked == False,
                RefreshTokenModel.expires_at > datetime.now(UTC),
                RefreshTokenModel.cafe_id != resolved_cafe_id,
                RefreshTokenModel.cafe_id != None,
            )
            .first()
        )
        if active_elsewhere:
            other_cafe = db.query(Cafe).filter(Cafe.id == active_elsewhere.cafe_id).first()
            cafe_name = other_cafe.name if other_cafe else f"Cafe #{active_elsewhere.cafe_id}"
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "already_logged_in",
                    "message": f"User is already logged in at {cafe_name}. Please log out there first.",
                    "cafe_id": active_elsewhere.cafe_id,
                    "cafe_name": cafe_name,
                },
            )

    # Create enriched access token (Phase 1: also returns the jti so we can
    # bind it to the refresh-token row for force-logout revocation).
    from app.auth.tokens import mint_access_token

    access_token, access_jti, _access_exp = mint_access_token(
        email=user.email,
        user_id=user.id,
        cafe_id=resolved_cafe_id,
        device_id=device_id,
        role=resolved_role,
    )

    # Create refresh token, binding it to the access token's jti so a future
    # force-logout can revoke both at once.
    refresh_token = create_refresh_token(
        db,
        user_id=user.id,
        cafe_id=resolved_cafe_id,
        device_id=device_id,
        ip_address=client_ip,
        access_jti=access_jti,
    )

    # SET HTTPONLY COOKIES
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/api/auth/refresh",
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "cafe_id": resolved_cafe_id,
        "role": resolved_role,
        "msg": "Cookie set",
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """Clear auth cookies and revoke refresh token."""
    # Revoke the refresh token if present
    refresh_cookie = request.cookies.get("refresh_token")
    if refresh_cookie:
        from app.auth.tokens import verify_refresh_token, revoke_refresh_token
        rt = verify_refresh_token(db, refresh_cookie)
        if rt:
            revoke_refresh_token(db, rt)

    response.delete_cookie(key="access_token")
    response.delete_cookie(key="refresh_token", path="/api/auth/refresh")
    return {"ok": True}


@router.post("/refresh")
def refresh_tokens(request: Request, response: Response, db: Session = Depends(get_db)):
    """Rotate refresh token and issue new access + refresh token pair."""
    from app.auth.tokens import (
        create_access_token as create_enriched_token,
        create_refresh_token,
        verify_refresh_token,
        revoke_refresh_token,
    )

    # Get refresh token from cookie or body
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    device_id = request.headers.get("x-device-id")

    rt = verify_refresh_token(db, raw_token, device_id=device_id)
    if rt is None:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Get user
    user = db.query(User).filter(User.id == rt.user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    # Resolve role from user_cafe_map if available
    from app.models import UserCafeMap
    resolved_role = user.role
    if rt.cafe_id:
        mapping = (
            db.query(UserCafeMap)
            .filter(UserCafeMap.user_id == user.id, UserCafeMap.cafe_id == rt.cafe_id)
            .first()
        )
        if mapping:
            resolved_role = mapping.role

    # Revoke old refresh token (rotation)
    revoke_refresh_token(db, rt)

    client_ip = str(request.client.host) if request.client else None

    # Issue new tokens (Phase 1: bind access jti onto the refresh row).
    from app.auth.tokens import mint_access_token

    new_access, new_access_jti, _ = mint_access_token(
        email=user.email,
        user_id=user.id,
        cafe_id=rt.cafe_id,
        device_id=rt.device_id,
        role=resolved_role,
    )
    new_refresh = create_refresh_token(
        db,
        user_id=user.id,
        cafe_id=rt.cafe_id,
        device_id=rt.device_id,
        ip_address=client_ip,
        access_jti=new_access_jti,
    )

    response.set_cookie(
        key="access_token",
        value=f"Bearer {new_access}",
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/api/auth/refresh",
    )

    return {"access_token": new_access, "token_type": "bearer"}


# ---- Simple Registration (no OTP) ----


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    birthdate: str | None = None  # accepts DD/MM/YYYY or ISO
    tos_accepted: bool | None = None


@router.post("/register")
def register_user(
    request: Request,
    body: RegisterIn | None = None,
    _rate_limited: None = Depends(REGISTER_LIMIT),
    name: str = Form(None),
    email: str = Form(None),
    password: str = Form(None),
    role: str = Form(None),
    first_name: str = Form(None),
    last_name: str = Form(None),
    phone: str = Form(None),
    dob: str = Form(None),  # 'dob' from frontend maps to 'birthdate'
    tos_accepted: bool = Form(None),
    db: Session = Depends(get_db),
):
    # Handle both JSON body and form data
    if body:
        # JSON request
        reg_name = body.name
        reg_email = body.email
        reg_password = body.password
        # Force public self-registration to client role
        reg_role = "client"
        reg_first_name = body.first_name
        reg_last_name = body.last_name
        reg_phone = body.phone
        reg_birthdate = body.birthdate
        reg_tos_accepted = body.tos_accepted
    else:
        # Form data request
        reg_name = name
        reg_email = email
        reg_password = password
        # Force public self-registration to client role
        reg_role = "client"
        reg_first_name = first_name
        reg_last_name = last_name
        reg_phone = phone
        reg_birthdate = dob  # frontend sends 'dob', maps to 'birthdate'
        reg_tos_accepted = tos_accepted

    if not reg_email or not reg_password or not reg_name:
        raise HTTPException(status_code=400, detail="Name, email and password are required")

    # Validate password strength
    is_valid, error_msg = validate_password_strength(reg_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    existing = db.query(User).filter(User.email == reg_email).first()
    if existing:
        # Do not reveal user existence - return same response as success
        # This prevents user enumeration attacks
        return {"ok": True}

    # Phase 1: hash with Argon2id directly. No SHA-256 pre-hash. Legacy
    # accounts created with the old format are still accepted on login via
    # authenticate_user() and rolling-migrated to the new format on first
    # successful login.
    hashed = _hash_password_v2(reg_password)
    # Parse birthdate if provided
    bd = None
    if reg_birthdate:
        try:
            # try DD/MM/YYYY
            bd = datetime.strptime(reg_birthdate, "%d/%m/%Y")
        except Exception:
            try:
                bd = datetime.fromisoformat(reg_birthdate)
            except Exception:
                bd = None

    user = User(
        name=reg_name,
        email=reg_email,
        password_hash=hashed,
        role=reg_role,
        first_name=reg_first_name,
        last_name=reg_last_name,
        phone=reg_phone,
        birthdate=bd,
        tos_accepted=bool(reg_tos_accepted) if reg_tos_accepted is not None else False,
        tos_accepted_at=datetime.utcnow() if reg_tos_accepted else None,
        is_email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Grant 5-minute starter credit as a UserOffer so the user can reach the
    # shop and buy a pack. Column is `minutes_remaining` (integer minutes) —
    # previously this was written as `hours_remaining=1.0`, which silently
    # failed because that column doesn't exist on the model.
    try:
        from app.models import UserOffer
        welcome_offer = UserOffer(
            user_id=user.id,
            offer_id=None,
            purchased_at=datetime.utcnow(),
            minutes_remaining=5,
        )
        db.add(welcome_offer)
        db.commit()
    except Exception:
        pass  # Don't fail registration if bonus fails

    try:
        from app.api.endpoints.audit import log_action  # local import to avoid circular

        log_action(db, user.id, "user_register", f"Email:{user.email}", None)
    except Exception:
        pass
    return {"ok": True}


# --- Optional: Password reset flow endpoints to match UI affordances ---
class ForgotPasswordIn(BaseModel):
    email: EmailStr


def _hash_reset_token(token: str) -> str:
    """SHA-256 the user-visible OTP/token before persisting.

    We store the digest, not the plaintext, so a DB compromise can't be
    weaponised into account takeover via still-valid OTPs.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_reset_otp() -> str:
    """Cryptographically-secure 6-digit numeric OTP, zero-padded."""
    return f"{secrets.randbelow(1_000_000):06d}"


# OTPs are short-lived because they're only 6 digits — 10 minutes gives
# users enough time to tab to email and back without leaving a valid
# code lying around for hours.
_RESET_OTP_TTL = timedelta(minutes=10)


@router.post("/password/forgot")
async def forgot_password(
    payload: ForgotPasswordIn,
    db: Session = Depends(get_db),
    _rate_limited: None = Depends(FORGOT_LIMIT),
):
    """Email the user a 6-digit OTP to begin a password reset.

    Always returns {ok: true} regardless of whether the email is
    registered, so callers can't enumerate accounts.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return {"ok": True}

    from app.models import PasswordResetToken

    # One active OTP per user — invalidate any prior unused ones so a
    # newly-emailed code is the only one that works.
    (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False))
        .update({"used": True}, synchronize_session=False)
    )

    otp = _generate_reset_otp()
    expires = datetime.utcnow() + _RESET_OTP_TTL
    pr = PasswordResetToken(
        user_id=user.id,
        token=_hash_reset_token(otp),
        expires_at=expires,
    )
    db.add(pr)
    db.commit()

    # Send the raw OTP to the user; only the hash is in the DB.
    # Use the real fastapi-mail-backed sender from app.utils.email — the
    # one in app.utils.auth is a no-op stub that was silently swallowing
    # every reset email and leaving users unable to recover their account.
    try:
        from app.utils.email import send_email as send_email_async

        subject = "Here is your OTP to reset your Primus password"
        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #1f2937;">
                <h2 style="color: #E8364F; margin-bottom: 4px;">Reset your password</h2>
                <p>Hi {user.email},</p>
                <p>Here is the OTP to reset your password:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                          background: #f3f4f6; padding: 16px 24px; border-radius: 8px;
                          display: inline-block; margin: 12px 0;">
                    {otp}
                </p>
                <p>This code expires in <b>10 minutes</b>. Enter it in the
                Primus reset password screen to choose a new password.</p>
                <p style="color: #6b7280; font-size: 13px;">
                    If you didn't request this, you can safely ignore this email —
                    your password will stay the same.
                </p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
                <p style="color: #9ca3af; font-size: 12px;">
                    Sent automatically by Primus. Don't reply to this email.
                </p>
            </body>
        </html>
        """
        await send_email_async([user.email], subject, body)
    except Exception as exc:  # pragma: no cover - email infra issues
        # Email delivery failure shouldn't reveal user existence either.
        # Log so operators can diagnose SMTP issues without surfacing to caller.
        import logging
        logging.getLogger("primus.auth").warning(
            "forgot_password: email send failed for user_id=%s: %s",
            user.id, exc,
        )
    return {"ok": True}


class ResetPasswordIn(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


@router.post("/password/reset")
def reset_password(
    payload: ResetPasswordIn,
    db: Session = Depends(get_db),
    _rate_limited: None = Depends(FORGOT_LIMIT),
):
    """Verify the email + OTP and set a new password.

    Returns a uniform "Invalid or expired code" for any failure that
    could leak whether the email is registered (no user, no active
    OTP, OTP mismatch). Distinguishes only used / expired states for
    OTPs we know exist for this user, since those don't leak account
    existence beyond what the forgot endpoint already exposes.
    """
    from app.models import PasswordResetToken

    if not payload.otp.strip():
        raise HTTPException(status_code=400, detail="Enter the code from your email")

    user = db.query(User).filter(User.email == payload.email).first()
    generic = HTTPException(status_code=400, detail="Invalid or expired code")
    if not user:
        raise generic

    otp_hash = _hash_reset_token(payload.otp.strip())
    rec = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.token == otp_hash,
        )
        .order_by(PasswordResetToken.id.desc())
        .first()
    )
    if not rec:
        raise generic
    if rec.used:
        raise HTTPException(
            status_code=400,
            detail="This code has already been used — request a new one",
        )
    if rec.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="This code has expired — request a new one",
        )

    user.password_hash = _hash_password_v2(payload.new_password)
    rec.used = True
    db.commit()

    # Defensive: revoke every active session for this user so a leaked
    # access token from before the reset cannot survive.
    try:
        from app.auth.tokens import revoke_all_refresh_tokens

        revoke_all_refresh_tokens(db, user_id=user.id)
    except Exception:
        logger.exception("password reset: failed to revoke active sessions")

    return {"ok": True}


@router.post("/login/firebase")
def login_with_firebase_disabled():
    raise HTTPException(status_code=410, detail="Firebase login disabled. Use email/password.")


@router.get("/verify-email")
def verify_email():
    raise HTTPException(410, "Deprecated; use Firebase login")


class TwoFactorSetupOut(BaseModel):
    secret: str
    otpauth_url: str
    recovery_codes: list[str]


def _generate_recovery_codes(n: int = 10) -> tuple[list[str], list[str]]:
    """Generate n recovery codes. Returns (plain_codes, hashed_codes)."""
    from passlib.hash import bcrypt as bcrypt_hash

    plain = [secrets.token_hex(4) for _ in range(n)]
    hashed = [bcrypt_hash.hash(code) for code in plain]
    return plain, hashed


@router.post("/2fa/enable", response_model=TwoFactorSetupOut)
def enable_2fa(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Enable TOTP-based 2FA for the current user.

    Returns a secret, otpauth URL, and 10 one-time recovery codes.
    Recovery codes are shown ONCE and stored as bcrypt hashes.
    """
    if not ENABLE_TOTP_2FA:
        raise HTTPException(status_code=410, detail="2FA is disabled.")
    if current_user.two_factor_secret:
        secret = current_user.two_factor_secret
    else:
        secret = pyotp.random_base32()
        current_user.two_factor_secret = secret

    # Generate fresh recovery codes every time 2FA is enabled/re-enabled
    plain_codes, hashed_codes = _generate_recovery_codes(10)
    current_user.two_factor_recovery_codes = hashed_codes
    db.add(current_user)
    db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="Primus",
    )
    return TwoFactorSetupOut(secret=secret, otpauth_url=uri, recovery_codes=plain_codes)


@router.post("/2fa/disable")
def disable_2fa(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Disable TOTP-based 2FA for the current user.
    """
    if not ENABLE_TOTP_2FA:
        raise HTTPException(status_code=410, detail="2FA is disabled.")
    current_user.two_factor_secret = None
    current_user.two_factor_recovery_codes = None
    db.add(current_user)
    db.commit()
    return {"ok": True}


class RecoveryCodeIn(BaseModel):
    email: str
    recovery_code: str


@router.post("/2fa/recover")
def recover_2fa(payload: RecoveryCodeIn, db: Session = Depends(get_db)):
    """
    Authenticate using a one-time recovery code when TOTP device is unavailable.

    Each recovery code can only be used once. After use it is removed from the list.
    """
    if not ENABLE_TOTP_2FA:
        raise HTTPException(status_code=410, detail="2FA is disabled.")

    from app.models import User
    from passlib.hash import bcrypt as bcrypt_hash

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.two_factor_secret:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    codes = user.two_factor_recovery_codes or []
    for i, hashed in enumerate(codes):
        if bcrypt_hash.verify(payload.recovery_code, hashed):
            # Consume the recovery code (remove from list)
            codes.pop(i)
            user.two_factor_recovery_codes = codes
            from sqlalchemy.orm.attributes import flag_modified

            flag_modified(user, "two_factor_recovery_codes")
            db.commit()

            # Issue access token
            token = create_access_token({"sub": user.email, "role": user.role})
            return {"access_token": token, "token_type": "bearer", "recovery_codes_remaining": len(codes)}

    raise HTTPException(status_code=401, detail="Invalid recovery code")


# (moved get_current_user/require_role above)


# ---- Example protected endpoints ----
@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.get("/oidc/me")
async def oidc_me(payload: dict = Depends(get_current_user_oidc)):
    """
    Introspect the currently provided OIDC token (e.g., from Keycloak).
    """
    return payload


@router.post("/me")
def update_me(
    payload: UserUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    if payload.birthdate:
        current_user.birthdate = payload.birthdate
        db.commit()
    return {"ok": True}
