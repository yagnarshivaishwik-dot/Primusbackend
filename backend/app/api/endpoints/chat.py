import html
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.remote_command import queue_device_event
from app.database import SessionLocal
from app.models import ChatMessage, ClientPC, User
from app.schemas import ChatMessageIn, ChatMessageOut
from app.ws import admin as ws_admin
from app.ws.auth import build_event

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Send message
@router.post("/", response_model=ChatMessageOut)
async def send_message(
    msg: ChatMessageIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    # Sanitize message to prevent XSS attacks
    sanitized_message = html.escape(msg.message) if msg.message else ""

    # Validate message length
    if len(sanitized_message) > 5000:
        raise HTTPException(status_code=400, detail="Message too long (max 5000 characters)")

    cm = ChatMessage(
        from_user_id=current_user.id,
        to_user_id=msg.to_user_id,
        pc_id=msg.pc_id,
        message=sanitized_message,
        timestamp=datetime.now(UTC),
        read=False,
    )
    db.add(cm)
    db.commit()
    db.refresh(cm)

    # Determine client name and logged-in user name for this PC
    client_name: str | None = None
    user_name: str = "Guest"
    if cm.pc_id:
        try:
            pc = db.query(ClientPC).filter_by(id=cm.pc_id).first()
        except Exception:
            pc = None
        if pc:
            client_name = pc.name or f"PC-{pc.id}"
            if pc.current_user_id:
                try:
                    user_obj = db.query(User).filter_by(id=pc.current_user_id).first()
                except Exception:
                    user_obj = None
                if user_obj:
                    # Prefer full name if available, otherwise fallback to email
                    user_name = (
                        getattr(user_obj, "name", None)
                        or f"{getattr(user_obj, 'first_name', '')} {getattr(user_obj, 'last_name', '')}".strip()
                        or getattr(user_obj, "email", "")  # type: ignore[arg-type]
                        or "Guest"
                    )
    if not client_name and cm.pc_id:
        client_name = f"PC-{cm.pc_id}"

    role = getattr(current_user, "role", None)
    sender = "client" if role == "client" else "admin"
    recipient = "admin" if sender == "client" else "client"

    # Broadcast real-time chat message via WebSockets with enriched payload
    ts = int(cm.timestamp.replace(tzinfo=UTC).timestamp())
    payload = {
        "message_id": str(cm.id),
        "client_id": cm.pc_id,
        "client_name": client_name,
        "user_name": user_name or ("Guest" if sender == "client" else "No user"),
        "text": cm.message,
        "from": sender,
        "to": recipient,
        "ts": ts,
    }
    envelope = build_event("chat.message", payload)
    json_envelope = json.dumps(envelope)

    # Notify all admins
    try:
        await ws_admin.broadcast_admin(json_envelope)
    except Exception:
        pass

    # Notify the specific PC client, if provided
    if cm.pc_id:
        try:
            queue_device_event(db, cm.pc_id, "chat.message", payload)
        except Exception:
            pass

    return cm


# Get my messages (latest first)
@router.get("/", response_model=list[ChatMessageOut])
def my_messages(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    msgs = (
        db.query(ChatMessage)
        .filter((ChatMessage.to_user_id == current_user.id) | (ChatMessage.to_user_id.is_(None)))
        .order_by(ChatMessage.timestamp.desc())
        .all()
    )
    return msgs
