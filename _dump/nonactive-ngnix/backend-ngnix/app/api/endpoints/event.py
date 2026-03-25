from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Event, EventProgress
from app.schemas import EventIn, EventOut, EventProgressOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=EventOut)
def create_event(
    evt: EventIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    e = Event(**evt.dict(), active=True)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    return (
        db.query(Event)
        .filter(Event.active.is_(True), Event.start_time <= now, Event.end_time >= now)
        .all()
    )


@router.post("/progress/{event_id}", response_model=EventProgressOut)
def update_progress(
    event_id: int, delta: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    prog = db.query(EventProgress).filter_by(event_id=event_id, user_id=current_user.id).first()
    if not prog:
        prog = EventProgress(
            event_id=event_id, user_id=current_user.id, progress=0, completed=False
        )
        db.add(prog)
    prog.progress += max(0, delta)
    db.commit()
    db.refresh(prog)
    return prog
