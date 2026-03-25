from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import HardwareStat
from app.schemas import HardwareStatIn, HardwareStatOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Client POSTs current stats (called every X seconds/minutes)
@router.post("/", response_model=HardwareStatOut)
def post_stat(
    stat: HardwareStatIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    hs = HardwareStat(
        pc_id=stat.pc_id,
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


# Admin: List latest stats for all PCs
@router.get("/latest", response_model=list[HardwareStatOut])
def latest_stats(current_user=Depends(require_role("admin")), db: Session = Depends(get_db)):
    # For each PC, get the latest stat entry
    subq = (
        db.query(HardwareStat.pc_id, func.max(HardwareStat.timestamp).label("max_ts"))
        .group_by(HardwareStat.pc_id)
        .subquery()
    )
    stats = (
        db.query(HardwareStat)
        .join(
            subq, (HardwareStat.pc_id == subq.c.pc_id) & (HardwareStat.timestamp == subq.c.max_ts)
        )
        .all()
    )
    return stats


# Admin: Get full stat history for a PC
@router.get("/history/{pc_id}", response_model=list[HardwareStatOut])
def stat_history(
    pc_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    stats = (
        db.query(HardwareStat)
        .filter_by(pc_id=pc_id)
        .order_by(HardwareStat.timestamp.desc())
        .limit(100)
        .all()
    )
    return stats
