import html
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.database import SessionLocal
from app.models import ChatMessage
from app.schemas import ChatMessageIn, ChatMessageOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Send message
@router.post("/", response_model=ChatMessageOut)
def send_message(
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
