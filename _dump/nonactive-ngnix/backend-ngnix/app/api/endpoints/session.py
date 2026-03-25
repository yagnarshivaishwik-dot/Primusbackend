from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import require_role
from app.api.endpoints.billing import calculate_billing
from app.database import SessionLocal
from app.models import ClientPC
from app.models import Session as PCSession
from app.schemas import SessionOut, SessionStart

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/start", response_model=SessionOut)
def start_session(data: SessionStart, db: Session = Depends(get_db)):
    session = PCSession(
        pc_id=data.pc_id,
        user_id=data.user_id,
        start_time=datetime.now(UTC),
        paid=False,
        amount=0.0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    try:
        log_action(db, data.user_id, "session_start", f"PC:{data.pc_id}", None)
    except Exception:
        pass
    # Mark active user on client_pc if a mapping exists by name
    try:
        # Best-effort: bind by PC name equal to logical PC id or name if provided elsewhere
        pc = db.query(ClientPC).filter_by(id=data.pc_id).first()
        if pc:
            pc.current_user_id = data.user_id
            db.commit()
    except Exception:
        pass
    return session


@router.post("/stop/{session_id}", response_model=SessionOut)
def stop_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(PCSession).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.end_time:
        return session
    session.end_time = datetime.now(UTC)
    db.commit()
    db.refresh(session)
    try:
        log_action(db, session.user_id, "session_stop", f"PC:{session.pc_id} duration", None)
    except Exception:
        pass
    # Attempt to calculate and charge billing
    try:
        _ = calculate_billing(session, db)
    except HTTPException:
        # If billing fails (e.g., insufficient balance), keep session ended but unpaid
        pass
    # Clear active user mapping
    try:
        pc = db.query(ClientPC).filter_by(id=session.pc_id).first()
        if pc:
            pc.current_user_id = None
            db.commit()
    except Exception:
        pass
    return session


# Admin: list active guest sessions
@router.get("/guests", response_model=list[SessionOut])
def list_guests(db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    sessions = (
        db.query(PCSession)
        .filter(PCSession.end_time.is_(None))
        .order_by(PCSession.start_time.desc())
        .all()
    )
    return sessions
