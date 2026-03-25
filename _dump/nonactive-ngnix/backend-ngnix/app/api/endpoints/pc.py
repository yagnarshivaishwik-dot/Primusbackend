from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user  # Import JWT protector
from app.database import SessionLocal
from app.models import PC
from app.schemas import PCOut, PCRegister

router = APIRouter()


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Register a new PC (protected: only logged-in users/admins can register)
@router.post("/register", response_model=PCOut)
def register_pc(
    pc: PCRegister, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    db_pc = db.query(PC).filter_by(name=pc.name).first()
    if db_pc:
        raise HTTPException(status_code=400, detail="PC name already registered")
    db_pc = PC(name=pc.name, status="idle", last_seen=datetime.utcnow())
    db.add(db_pc)
    db.commit()
    db.refresh(db_pc)
    return db_pc


# List all PCs (protected)
@router.get("/", response_model=list[PCOut])
def list_pcs(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    pcs = db.query(PC).all()
    return pcs


# Update PC state (idle/in_use/locked/offline, protected)
@router.post("/state/{pc_id}")
def update_pc_state(
    pc_id: int, status: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    pc = db.query(PC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    pc.status = status
    pc.last_seen = datetime.utcnow()
    db.commit()
    return {"status": pc.status, "last_seen": pc.last_seen}
