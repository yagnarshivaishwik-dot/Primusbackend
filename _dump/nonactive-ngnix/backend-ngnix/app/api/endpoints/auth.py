import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.hash import bcrypt
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, JWT_SECRET
from app.database import get_db
from app.models import User
from app.schemas import UserOut, UserUpdate
from app.utils.security import validate_password_strength

router = APIRouter()

# ---- JWT Settings ----
# Use centralized config with fail-fast validation

## Firebase login disabled in this configuration

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ---- Database Dependency ----
# Use get_db from app.database to allow test overrides


# ---- JWT Authentication Dependency (defined early to use in Depends) ----
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
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
        # Preserve JWT decoding error context for debugging
        raise credentials_exception from exc
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    # Ensure user object is fully loaded - access all attributes to prevent lazy loading
    # This prevents detached instance errors when the session closes
    _ = user.id, user.email, user.role, user.wallet_balance
    return user


# ---- Role-based Dependency ----
def require_role(role: str):
    """
    Create a dependency that requires a specific role.

    Args:
        role: Required role name (e.g., 'admin', 'staff', 'client')

    Returns:
        Dependency function that checks user role
    """

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role != role:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user

    return role_checker


## Registration: simple name/email/password


# ---- Authenticate Helper ----
def authenticate_user(db, email_or_username, password):
    # Support login by email or username if needed
    user = (
        db.query(User)
        .filter((User.email == email_or_username) | (User.name == email_or_username))
        .first()
    )
    if user and bcrypt.verify(password, user.password_hash):
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


# ---- Login Endpoint (Token) ----
@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate user and return JWT token."""
    from app.utils.account_lockout import (
        clear_login_attempts,
        is_account_locked,
        record_failed_login_attempt,
    )

    email = form_data.username.lower().strip()
    client_ip = str(request.client.host) if request and request.client else None

    # Check if account is locked
    locked, seconds_remaining = is_account_locked(email)
    if locked:
        minutes_remaining = int(seconds_remaining / 60) + 1
        # Audit log locked account attempt
        try:
            from app.api.endpoints.audit import log_action  # local import to avoid circular

            log_action(db, None, "login_locked", f"Email:{email} locked", client_ip)
        except Exception:
            pass
        raise HTTPException(
            status_code=423,
            detail=f"Account locked due to too many failed login attempts. Try again in {minutes_remaining} minute(s).",
        )

    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        # Record failed attempt
        record_failed_login_attempt(email)
        # Audit log failed login
        try:
            from app.api.endpoints.audit import log_action  # local import to avoid circular

            log_action(db, None, "login_failed", f"Email:{email} failed", client_ip)
        except Exception:
            pass
        # Always return generic error to prevent user enumeration
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Clear failed attempts on successful login
    clear_login_attempts(email)

    # Audit log successful login
    try:
        from app.api.endpoints.audit import log_action  # local import to avoid circular

        log_action(db, user.id, "login_success", f"Email:{email} role:{user.role}", client_ip)
    except Exception:
        pass

    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "cafe_id": user.cafe_id}  # or user.name
    )
    return {"access_token": access_token, "token_type": "bearer"}


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
        reg_first_name = None
        reg_last_name = None
        reg_phone = None
        reg_birthdate = None
        reg_tos_accepted = None

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
    hashed = bcrypt.hash(reg_password)
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
        .filter(PasswordResetToken.token == payload.token, PasswordResetToken.used == False)
        .first()
    )
    if not rec or rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == rec.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid token")
    user.password_hash = bcrypt.hash(payload.new_password)
    rec.used = True
    db.commit()
    return {"ok": True}


@router.post("/login/firebase")
def login_with_firebase_disabled():
    raise HTTPException(status_code=410, detail="Firebase login disabled. Use email/password.")


@router.get("/verify-email")
def verify_email():
    raise HTTPException(410, "Deprecated; use Firebase login")


@router.post("/2fa/enable")
def enable_2fa():
    raise HTTPException(status_code=410, detail="2FA is disabled.")


@router.post("/2fa/disable")
def disable_2fa():
    raise HTTPException(status_code=410, detail="2FA is disabled.")


# (moved get_current_user/require_role above)


# ---- Example protected endpoint ----
@router.get("/me", response_model=UserOut)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/me")
def update_me(
    payload: UserUpdate, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    if payload.birthdate:
        current_user.birthdate = payload.birthdate
        db.commit()
    return {"ok": True}
