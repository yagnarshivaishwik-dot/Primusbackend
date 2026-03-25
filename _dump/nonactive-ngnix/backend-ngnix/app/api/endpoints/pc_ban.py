from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.database import SessionLocal
from app.models import PC

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Admin: ban a PC
@router.post("/ban/{pc_id}")
def ban_pc(
    pc_id: int,
    reason: str,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pc.banned = True
    pc.ban_reason = reason
    db.commit()
    return {"message": f"PC {pc_id} banned", "reason": reason}


# Admin: unban a PC
@router.post("/unban/{pc_id}")
def unban_pc(
    pc_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pc.banned = False
    pc.ban_reason = None
    db.commit()
    return {"message": f"PC {pc_id} unbanned"}


# Everyone: check if a PC is banned (client can poll)
@router.get("/status/{pc_id}")
def pc_ban_status(pc_id: int, db: Session = Depends(get_db)):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    return {"banned": pc.banned, "reason": pc.ban_reason}
