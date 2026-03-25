from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Leaderboard, LeaderboardEntry
from app.schemas import LeaderboardEntryOut, LeaderboardIn, LeaderboardOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=LeaderboardOut)
def create_lb(
    lb: LeaderboardIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    leaderboard = Leaderboard(**lb.dict(), active=True)
    db.add(leaderboard)
    db.commit()
    db.refresh(leaderboard)
    return leaderboard


@router.get("/", response_model=list[LeaderboardOut])
def list_lbs(db: Session = Depends(get_db)):
    return db.query(Leaderboard).filter_by(active=True).all()


def period_bounds(scope: str):
    now = datetime.utcnow()
    if scope == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
    elif scope == "weekly":
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = start + timedelta(days=7)
    else:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    return start, end


@router.post("/record/{leaderboard_id}")
def record_value(
    leaderboard_id: int,
    value: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lb = db.query(Leaderboard).filter_by(id=leaderboard_id, active=True).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    start, end = period_bounds(lb.scope)
    entry = (
        db.query(LeaderboardEntry)
        .filter_by(
            leaderboard_id=leaderboard_id,
            user_id=current_user.id,
            period_start=start,
            period_end=end,
        )
        .first()
    )
    if not entry:
        entry = LeaderboardEntry(
            leaderboard_id=leaderboard_id,
            user_id=current_user.id,
            period_start=start,
            period_end=end,
            value=0,
        )
        db.add(entry)
    entry.value += value
    db.commit()
    return {"ok": True}


@router.get("/{leaderboard_id}", response_model=list[LeaderboardEntryOut])
def list_leaderboard(leaderboard_id: int, db: Session = Depends(get_db)):
    entries = (
        db.query(LeaderboardEntry)
        .filter_by(leaderboard_id=leaderboard_id)
        .order_by(LeaderboardEntry.value.desc())
        .limit(50)
        .all()
    )
    return entries
