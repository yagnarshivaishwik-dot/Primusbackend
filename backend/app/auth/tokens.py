"""JWT access token and refresh token management with device binding."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    JWT_SECRET,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.models import RefreshToken


def create_access_token(
    *,
    email: str,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
    role: str = "client",
    expires_delta: timedelta | None = None,
) -> str:
    """Create a short-lived access token with enriched claims."""
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload = {
        "sub": email,
        "user_id": user_id,
        "cafe_id": cafe_id,
        "device_id": device_id,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def create_refresh_token(
    db: Session,
    *,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
    ip_address: str | None = None,
) -> str:
    """Create a refresh token, store its hash in DB, return raw token."""
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    rt = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        device_id=device_id,
        cafe_id=cafe_id,
        issued_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=ip_address,
    )
    db.add(rt)
    db.commit()
    return raw_token


def verify_refresh_token(
    db: Session,
    raw_token: str,
    device_id: str | None = None,
) -> RefreshToken | None:
    """Verify a refresh token. Returns the RefreshToken row or None."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    rt = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
        )
        .first()
    )
    if rt is None:
        return None

    # Check expiry
    if rt.expires_at < datetime.now(UTC):
        return None

    # If the refresh token was bound to a device, enforce match
    if rt.device_id and device_id and rt.device_id != device_id:
        return None

    return rt


def revoke_refresh_token(db: Session, rt: RefreshToken) -> None:
    """Revoke a single refresh token (for rotation)."""
    rt.revoked = True
    rt.revoked_at = datetime.now(UTC)
    db.commit()


def revoke_all_refresh_tokens(
    db: Session,
    *,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
) -> int:
    """Revoke all active refresh tokens for a user, optionally scoped to cafe/device."""
    query = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked == False,  # noqa: E712
    )
    if cafe_id is not None:
        query = query.filter(RefreshToken.cafe_id == cafe_id)
    if device_id is not None:
        query = query.filter(RefreshToken.device_id == device_id)

    now = datetime.now(UTC)
    count = query.update({"revoked": True, "revoked_at": now})
    db.commit()
    return count


def decode_access_token(token: str) -> dict | None:
    """Decode and validate an access token. Returns claims dict or None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None
