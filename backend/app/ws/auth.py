from datetime import UTC, datetime

from jose import JWTError, jwt

from app.config import ALGORITHM, JWT_SECRET
from app.database import SessionLocal
from app.models import User


class WSAuthError(Exception):
    """Raised when WebSocket authentication fails."""


def authenticate_ws_token(token: str) -> User:
    """
    Validate a JWT token for WebSocket connections and return the User.

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
        return user
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
