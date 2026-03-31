from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import Event, EventProgress
from app.schemas import EventIn, EventOut, EventProgressOut

router = APIRouter()


@router.post("/", response_model=EventOut)
def create_event(
    evt: EventIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    e = Event(**evt.dict(), cafe_id=ctx.cafe_id, active=True)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/", response_model=list[EventOut])
def list_events(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    now = datetime.now(UTC)
    return (
        scoped_query(db, Event, ctx)
        .filter(Event.active.is_(True), Event.start_time <= now, Event.end_time >= now)
        .all()
    )


@router.post("/progress/{event_id}", response_model=EventProgressOut)
def update_progress(
    event_id: int,
    delta: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    # Verify event belongs to user's cafe
    evt_obj = db.query(Event).filter_by(id=event_id).first()
    enforce_cafe_ownership(evt_obj, ctx)

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
