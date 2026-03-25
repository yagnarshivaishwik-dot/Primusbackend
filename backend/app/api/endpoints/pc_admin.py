import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.database import SessionLocal
from app.models import PC
from app.ws.pc import notify_pc

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Grant admin rights
@router.post("/grant/{pc_id}")
def grant_admin(
    pc_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pc.admin_rights = True
    db.commit()
    return {"message": "Admin rights granted"}


# Revoke admin rights
@router.post("/revoke/{pc_id}")
def revoke_admin(
    pc_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pc.admin_rights = False
    db.commit()
    return {"message": "Admin rights revoked"}


# Check status
@router.get("/status/{pc_id}")
def admin_status(pc_id: int, db: Session = Depends(get_db)):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    return {"admin_rights": pc.admin_rights}


# Remote disable admin mode on client (push over WS)
@router.post("/command/{pc_id}/admin_off")
async def admin_off(pc_id: int, current_user=Depends(require_role("admin"))):
    try:
        await notify_pc(pc_id, json.dumps({"command": "admin_off"}))
    except Exception:
        pass
    return {"status": "ok"}
