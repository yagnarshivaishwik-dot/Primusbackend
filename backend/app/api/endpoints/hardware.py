from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import HardwareStat
from app.schemas import HardwareStatIn, HardwareStatOut
from app.utils.cache import get_or_set, publish_invalidation

router = APIRouter()


# Client POSTs current stats (called every X seconds/minutes)
@router.post("/", response_model=HardwareStatOut)
async def post_stat(
    stat: HardwareStatIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    def _create() -> HardwareStat:
        hs = HardwareStat(
            pc_id=stat.pc_id,
            cafe_id=ctx.cafe_id,
            timestamp=datetime.utcnow(),
            cpu_percent=stat.cpu_percent,
            ram_percent=stat.ram_percent,
            disk_percent=stat.disk_percent,
            gpu_percent=stat.gpu_percent,
            temp=stat.temp,
        )
        db.add(hs)
        db.commit()
        db.refresh(hs)
        return hs

    hs = await run_in_threadpool(_create)

    await publish_invalidation(
        {
            "scope": "hardware",
            "items": [
                {"type": "pc_status_latest", "id": "all"},
                {"type": "pc_status_history", "id": f"pc={stat.pc_id}"},
            ],
        }
    )

    return hs


# Admin: List latest stats for all PCs
@router.get("/latest", response_model=list[HardwareStatOut])
async def latest_stats(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    async def _compute() -> list[HardwareStatOut]:
        def _query():
            base = scoped_query(db, HardwareStat, ctx)
            subq = (
                base.with_entities(HardwareStat.pc_id, func.max(HardwareStat.timestamp).label("max_ts"))
                .group_by(HardwareStat.pc_id)
                .subquery()
            )
            return (
                scoped_query(db, HardwareStat, ctx)
                .join(
                    subq,
                    (HardwareStat.pc_id == subq.c.pc_id)
                    & (HardwareStat.timestamp == subq.c.max_ts),
                )
                .all()
            )

        return await run_in_threadpool(_query)

    # PC status snapshots: cache for 10 seconds
    return await get_or_set(
        "pc_status_latest",
        "all",
        "pc_status",
        _compute,
        ttl=10,
        version="v1",
        stampede_key="pc_status_latest_all",
    )


# Admin: Get full stat history for a PC
@router.get("/history/{pc_id}", response_model=list[HardwareStatOut])
async def stat_history(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    cache_id = f"pc={pc_id}"

    async def _compute() -> list[HardwareStatOut]:
        def _query():
            return (
                scoped_query(db, HardwareStat, ctx)
                .filter(HardwareStat.pc_id == pc_id)
                .order_by(HardwareStat.timestamp.desc())
                .limit(100)
                .all()
            )

        return await run_in_threadpool(_query)

    # History snapshots: cache for 30 seconds
    return await get_or_set(
        "pc_status_history",
        cache_id,
        "pc_status",
        _compute,
        ttl=30,
        version="v1",
        stampede_key=cache_id,
    )
