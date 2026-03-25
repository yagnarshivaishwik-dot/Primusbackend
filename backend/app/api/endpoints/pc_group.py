from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import PC, PCGroup, PCToGroup
from app.schemas import PCGroupIn, PCGroupOut, PCToGroupIn, PCToGroupOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Admin: Create group
@router.post("/", response_model=PCGroupOut)
def create_group(
    group: PCGroupIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    g = PCGroup(name=group.name, description=group.description)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


# Admin: List groups
@router.get("/", response_model=list[PCGroupOut])
def list_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(PCGroup).all()


# Admin: Assign PC to group
@router.post("/assign", response_model=PCToGroupOut)
def assign_pc_to_group(
    data: PCToGroupIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    pc = db.query(PC).filter_by(id=data.pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    grp = db.query(PCGroup).filter_by(id=data.group_id).first()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found")
    mapping = PCToGroup(pc_id=data.pc_id, group_id=data.group_id)
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


# List all PCs in a group
@router.get("/group/{group_id}", response_model=list[int])
def pcs_in_group(
    group_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    pcs = db.query(PCToGroup).filter_by(group_id=group_id).all()
    return [m.pc_id for m in pcs]
