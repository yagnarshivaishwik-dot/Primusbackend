import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

import httpx
import pyotp
from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.hash import bcrypt
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    ENABLE_TOTP_2FA,
    JWT_SECRET,
    OIDC_AUDIENCE,
    OIDC_ISSUER,
)
from app.database import get_db
from app.models import User
from app.schemas import UserOut, UserUpdate
from app.utils.security import validate_password_strength

router = APIRouter()

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
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


# ---- Password normalization & authenticate helper ----


def _normalize_password(password: str) -> str:
    """
    Normalize user passwords before hashing/verifying.

    - Allows arbitrarily long passwords without hitting bcrypt's 72‑byte limit
      by hashing the UTF‑8 password with SHA‑256 first.
    - Keeps one consistent hashing scheme everywhere.
    """
    # Encode as UTF‑8 and hash; hex digest is always 64 ASCII chars.
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _is_argon2_hash(hash_str: str) -> bool:
    return hash_str.startswith("$argon2")


# ---- Authenticate Helper ----
def authenticate_user(db, email_or_username, password):
    # Support login by email or username if needed
    user = (
        db.query(User)
        .filter((User.email == email_or_username) | (User.name == email_or_username))
        .first()
    )
    if not user:
        return None

    normalized = _normalize_password(password)
    stored = user.password_hash or ""

    # Prefer Argon2id for new and migrated users
    if _is_argon2_hash(stored):
        try:
            if ph.verify(stored, normalized):
                # Rehash if parameters changed
                if ph.check_needs_rehash(stored):
                    user.password_hash = ph.hash(normalized)
                    db.add(user)
                    db.commit()
                return user
        except argon2_exceptions.VerifyMismatchError:
            return None
        except Exception:
            return None

    # Backwards-compatible bcrypt verification for existing users
    if bcrypt.verify(normalized, stored):
        # Optionally migrate to Argon2id on successful login
        try:
            user.password_hash = ph.hash(normalized)
            db.add(user)
            db.commit()
        except Exception:
            pass
        return user
    return None


# ---- JWT Token Creation ----
def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary containing token claims (e.g., {'sub': email, 'role': role})
        expires_delta: Optional custom expiration time. If None, uses ACCESS_TOKEN_EXPIRE_MINUTES from config.

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
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

    # Create enriched access token
    access_token = create_enriched_token(
        email=user.email,
        user_id=user.id,
        cafe_id=resolved_cafe_id,
        device_id=device_id,
        role=resolved_role,
    )

    # Create refresh token
    refresh_token = create_refresh_token(
        db,
        user_id=user.id,
        cafe_id=resolved_cafe_id,
        device_id=device_id,
        ip_address=client_ip,
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

    # Issue new tokens
    new_access = create_enriched_token(
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
    body: RegisterIn | None = None,
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

    # Hash normalized password with Argon2id (preferred) while keeping bcrypt
    # verification for legacy accounts via authenticate_user().
    normalized = _normalize_password(reg_password)
    hashed = ph.hash(normalized)
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

    # Grant 1-hour welcome bonus as free time (UserOffer)
    try:
        from app.models import UserOffer
        welcome_offer = UserOffer(
            user_id=user.id,
            offer_id=None,  # No specific offer, just bonus time
            purchased_at=datetime.utcnow(),
            hours_remaining=1.0,  # 1 hour free
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


@router.post("/password/forgot")
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        # Do not reveal user existence
        return {"ok": True}
    # Minimal token model without email-sending for now
    from app.models import PasswordResetToken

    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=1)
    pr = PasswordResetToken(user_id=user.id, token=token, expires_at=expires)
    db.add(pr)
    db.commit()
    # If SMTP configured, send email (optional)
    try:
        from app.utils.auth import send_email

        reset_link = f"/reset?token={token}"
        send_email(user.email, "Password reset", f"Click to reset: {reset_link}")
    except Exception:
        pass
    return {"ok": True}


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


@router.post("/password/reset")
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    from app.models import PasswordResetToken

    rec = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == payload.token, PasswordResetToken.used.is_(False))
        .first()
    )
    if not rec or rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == rec.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    new_password = payload.new_password
    normalized = _normalize_password(new_password)
    user.password_hash = ph.hash(normalized)
    rec.used = True
    db.commit()
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


@router.post("/2fa/enable", response_model=TwoFactorSetupOut)
def enable_2fa(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Enable TOTP-based 2FA for the current user.

    Returns a secret and otpauth URL which can be scanned by an authenticator app.
    """
    if not ENABLE_TOTP_2FA:
        raise HTTPException(status_code=410, detail="2FA is disabled.")
    if current_user.two_factor_secret:
        # Already enabled; re-use existing secret
        secret = current_user.two_factor_secret
    else:
        secret = pyotp.random_base32()
        current_user.two_factor_secret = secret
        db.add(current_user)
        db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="Primus",
    )
    return TwoFactorSetupOut(secret=secret, otpauth_url=uri)


@router.post("/2fa/disable")
def disable_2fa(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Disable TOTP-based 2FA for the current user.
    """
    if not ENABLE_TOTP_2FA:
        raise HTTPException(status_code=410, detail="2FA is disabled.")
    current_user.two_factor_secret = None
    db.add(current_user)
    db.commit()
    return {"ok": True}


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
