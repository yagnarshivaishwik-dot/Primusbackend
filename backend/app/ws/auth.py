from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Optional

import jwt
from jwt.exceptions import PyJWTError as JWTError

from app.config import ALGORITHM, JWT_SECRET
from app.db.global_db import global_session_factory as SessionLocal
from app.models import User


class WSAuthError(Exception):
    """Raised when WebSocket authentication fails."""


@dataclass
class WSAuthResult:
    """Rich authentication result for WebSocket connections."""
    user: User
    cafe_id: Optional[int]
    device_id: Optional[str]
    role: str


def authenticate_ws_token(token: str) -> WSAuthResult:
    """
    Validate a JWT token for WebSocket connections and return a WSAuthResult.

    Decodes the JWT and extracts cafe_id, device_id, and role from claims.
    Falls back to user.cafe_id if the token doesn't carry cafe_id (legacy tokens).

    This mirrors the HTTP JWT validation used in auth.get_current_user but is
    usable from plain WebSocket handlers without FastAPI dependencies.
    """
    if not token:
        raise WSAuthError("Missing token")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise WSAuthError("Token missing subject")
        # Extract optional claims
        token_cafe_id = payload.get("cafe_id")
        token_device_id = payload.get("device_id")
        token_role = payload.get("role")
        # Optional: exp is validated by jose during decode
    except JWTError as exc:  # pragma: no cover - defensive
        raise WSAuthError("Invalid token") from exc

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            raise WSAuthError("User not found")
        # Touch attributes to ensure they are loaded before session closes
        _ = user.id, user.email, user.role, getattr(user, "cafe_id", None)

        # Resolve cafe_id: prefer token claim, fallback to user record
        cafe_id = token_cafe_id if token_cafe_id is not None else getattr(user, "cafe_id", None)
        # Resolve role: prefer token claim, fallback to user record
        role = token_role or getattr(user, "role", "client")

        return WSAuthResult(
            user=user,
            cafe_id=int(cafe_id) if cafe_id is not None else None,
            device_id=token_device_id,
            role=role,
        )
    finally:
        db.close()


def build_event(event: str, payload: dict) -> dict:
    """
    Helper to build a standard WS event envelope.

    All WebSocket messages should use:
        { "event": "<name>", "payload": {...}, "ts": <unix-epoch-seconds> }
    """
    return {
        "event": event,
        "payload": payload,
        "ts": int(datetime.now(UTC).timestamp()),
    }
