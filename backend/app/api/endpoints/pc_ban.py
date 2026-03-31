from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import require_role
from app.db.dependencies import get_cafe_db as get_db
from app.models import PC
from app.utils.cache import get_or_set, publish_invalidation

router = APIRouter()



# Admin: ban a PC
@router.post("/ban/{pc_id}")
async def ban_pc(
    pc_id: int,
    reason: str,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    def _ban() -> None:
        pc = db.query(PC).filter_by(id=pc_id).first()
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        pc.banned = True
        pc.ban_reason = reason
        db.commit()

    await run_in_threadpool(_ban)

    await publish_invalidation(
        {
            "scope": "pc_ban",
            "items": [
                {"type": "pc_ban_status", "id": str(pc_id)},
            ],
        }
    )
    return {"message": f"PC {pc_id} banned", "reason": reason}


# Admin: unban a PC
@router.post("/unban/{pc_id}")
async def unban_pc(
    pc_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    def _unban() -> None:
        pc = db.query(PC).filter_by(id=pc_id).first()
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        pc.banned = False
        pc.ban_reason = None
        db.commit()

    await run_in_threadpool(_unban)

    await publish_invalidation(
        {
            "scope": "pc_ban",
            "items": [
                {"type": "pc_ban_status", "id": str(pc_id)},
            ],
        }
    )
    return {"message": f"PC {pc_id} unbanned"}


# Everyone: check if a PC is banned (client can poll)
@router.get("/status/{pc_id}")
async def pc_ban_status(pc_id: int, db: Session = Depends(get_db)):
    cache_id = str(pc_id)

    async def _compute() -> dict:
        def _query() -> dict:
            pc = db.query(PC).filter_by(id=pc_id).first()
            if not pc:
                raise HTTPException(status_code=404, detail="PC not found")
            return {"banned": pc.banned, "reason": pc.ban_reason}

        return await run_in_threadpool(_query)

    # PC ban status snapshot: cache for 10 seconds
    return await get_or_set(
        "pc_ban_status",
        cache_id,
        "pc_status",
        _compute,
        ttl=10,
        version="v1",
        stampede_key=cache_id,
    )
