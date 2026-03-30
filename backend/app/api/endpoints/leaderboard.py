from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.database import SessionLocal
from app.models import Leaderboard, LeaderboardEntry
from app.schemas import LeaderboardEntryOut, LeaderboardIn, LeaderboardOut
from app.utils.cache import get_or_set, publish_invalidation

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=LeaderboardOut)
async def create_lb(
    lb: LeaderboardIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    def _create() -> Leaderboard:
        leaderboard = Leaderboard(**lb.dict(), cafe_id=ctx.cafe_id, active=True)
        db.add(leaderboard)
        db.commit()
        db.refresh(leaderboard)
        return leaderboard

    leaderboard = await run_in_threadpool(_create)

    await publish_invalidation(
        {
            "scope": "leaderboard",
            "items": [
                {"type": "leaderboard_list", "id": "*"},
            ],
        }
    )

    return leaderboard


@router.get("/", response_model=list[LeaderboardOut])
async def list_lbs(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    async def _compute() -> list[LeaderboardOut]:
        def _query():
            return scoped_query(db, Leaderboard, ctx).filter(Leaderboard.active.is_(True)).all()

        return await run_in_threadpool(_query)

    # Leaderboard list is relatively static; cache for 5 minutes
    return await get_or_set(
        "leaderboard_list",
        "all",
        "leaderboard",
        _compute,
        ttl=300,
        version="v1",
        stampede_key="leaderboard_list_all",
    )


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
async def record_value(
    leaderboard_id: int,
    value: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    def _record() -> None:
        lb = db.query(Leaderboard).filter_by(id=leaderboard_id, active=True).first()
        if not lb:
            raise HTTPException(status_code=404, detail="Leaderboard not found")
        enforce_cafe_ownership(lb, ctx)
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

    await run_in_threadpool(_record)

    await publish_invalidation(
        {
            "scope": "leaderboard",
            "items": [
                {"type": "leaderboard_entries", "id": str(leaderboard_id)},
            ],
        }
    )
    return {"ok": True}


@router.get("/{leaderboard_id}", response_model=list[LeaderboardEntryOut])
async def list_leaderboard(leaderboard_id: int, db: Session = Depends(get_db)):
    cache_id = f"id={leaderboard_id}"

    async def _compute() -> list[LeaderboardEntryOut]:
        def _query():
            return (
                db.query(LeaderboardEntry)
                .filter_by(leaderboard_id=leaderboard_id)
                .order_by(LeaderboardEntry.value.desc())
                .limit(50)
                .all()
            )

        return await run_in_threadpool(_query)

    # Leaderboards are relatively dynamic; cache for 20 seconds
    return await get_or_set(
        "leaderboard_entries",
        cache_id,
        "leaderboard",
        _compute,
        ttl=20,
        version="v1",
        stampede_key=cache_id,
    )
