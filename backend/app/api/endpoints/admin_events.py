import asyncio
import json

from fastapi import APIRouter, Depends, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.config import ALGORITHM, JWT_SECRET
from app.database import get_db
from app.models import SystemEvent, User

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
    """
    # 1. Validate Auth (SSE doesn't support headers, check query param)
    user = await get_user_from_token(token, db)
    if not user or user.role != "admin":
        return EventSourceResponse(iter([{"event": "error", "data": "unauthorized"}]))

    async def event_generator():
        # Track position
        cursor = last_event_id or 0

        # If no cursor provided, default to events from the last 1 minute to avoid massive backlogs
        if cursor == 0:
            latest = db.query(SystemEvent).order_by(SystemEvent.id.desc()).first()
            cursor = latest.id if latest else 0

        while True:
            # Check for disconnect
            if await request.is_disconnected():
                break

            # Fetch new events for this cafe
            events = (
                db.query(SystemEvent)
                .filter(SystemEvent.id > cursor, SystemEvent.cafe_id == user.cafe_id)
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
            db.expire_all()  # Ensure we see new DB rows

    return EventSourceResponse(event_generator())
