import asyncio
import json

from fastapi import APIRouter, Depends, Request
import jwt
from jwt.exceptions import PyJWTError as JWTError
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.config import ALGORITHM, JWT_SECRET
from app.db.dependencies import get_global_db as get_db
from app.db.models_cafe import SystemEvent
from app.db.router import cafe_db_router
from app.models import User

router = APIRouter()


async def get_user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            return None
        user = db.query(User).filter(User.email == email).first()
        return user
    except JWTError:
        return None


@router.get("/stream")
async def event_stream(
    request: Request,
    last_event_id: int | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """
    MASTER SYSTEM: Real-time Admin UI updates via SSE.
    cafe_id is resolved from the JWT — SystemEvent is queried from the per-cafe DB.
    """
    # 1. Validate Auth via global DB (SSE doesn't support headers, check query param)
    user = await get_user_from_token(token, db)
    _admin_roles = {"admin", "cafeadmin", "owner", "superadmin", "staff"}
    if not user or user.role not in _admin_roles:
        return EventSourceResponse(iter([{"event": "error", "data": "unauthorized"}]))

    cafe_id = user.cafe_id

    async def event_generator():
        cafe_db: Session = cafe_db_router.get_session(cafe_id)
        try:
            # Track position
            cursor = last_event_id or 0

            # Default to latest event to avoid replaying entire backlog
            if cursor == 0:
                latest = cafe_db.query(SystemEvent).order_by(SystemEvent.id.desc()).first()
                cursor = latest.id if latest else 0

            while True:
                # Check for disconnect
                if await request.is_disconnected():
                    break

                # Fetch new events — cafe_db is already scoped to this cafe's DB
                events = (
                    cafe_db.query(SystemEvent)
                    .filter(SystemEvent.id > cursor)
                    .order_by(SystemEvent.id.asc())
                    .all()
                )

                if events:
                    for ev in events:
                        yield {
                            "id": str(ev.id),
                            "event": ev.type,
                            "data": json.dumps(
                                {
                                    "type": ev.type,
                                    "pc_id": ev.pc_id,
                                    "payload": ev.payload,
                                    "timestamp": ev.timestamp.isoformat(),
                                }
                            ),
                        }
                        cursor = ev.id

                # Heartbeat to keep connection alive
                else:
                    yield {"event": "ping", "data": "keep-alive"}

                await asyncio.sleep(1)  # Check every second
                cafe_db.expire_all()  # Ensure we see new DB rows
        finally:
            cafe_db.close()

    return EventSourceResponse(event_generator())
