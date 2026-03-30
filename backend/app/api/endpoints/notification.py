from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query
from app.database import SessionLocal
from app.models import Notification
from app.schemas import NotificationIn, NotificationOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Send notification
@router.post("/", response_model=NotificationOut)
def send_notification(
    notif: NotificationIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    n = Notification(
        user_id=notif.user_id,
        pc_id=notif.pc_id,
        cafe_id=ctx.cafe_id,
        type=notif.type,
        content=notif.content,
        created_at=datetime.now(UTC),
        seen=False,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


# Get my notifications (latest first)
@router.get("/", response_model=list[NotificationOut])
def my_notifications(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    notes = (
        scoped_query(db, Notification, ctx)
        .filter((Notification.user_id == current_user.id) | (Notification.user_id.is_(None)))
        .order_by(Notification.created_at.desc())
        .all()
    )
    return notes
