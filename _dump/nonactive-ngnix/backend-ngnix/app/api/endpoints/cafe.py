from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Cafe, User
from app.schemas import CafeCreate, CafeOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# SUPERADMIN: Register new cafe and assign owner
@router.post("/", response_model=CafeOut)
def create_cafe(
    cafe: CafeCreate,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    if db.query(Cafe).filter_by(name=cafe.name).first():
        raise HTTPException(status_code=400, detail="Cafe name already taken")
    owner = db.query(User).filter_by(id=cafe.owner_id, role="cafeadmin").first()
    if not owner:
        raise HTTPException(status_code=404, detail="Cafe owner (cafeadmin) not found")
    c = Cafe(name=cafe.name, owner_id=owner.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    # Also link owner to cafe
    owner.cafe_id = c.id
    db.commit()
    return c


# SUPERADMIN: List all cafes
@router.get("/", response_model=list[CafeOut])
def list_cafes(current_user=Depends(require_role("superadmin")), db: Session = Depends(get_db)):
    return db.query(Cafe).all()


# CAFEADMIN: View my cafe info
@router.get("/mine", response_model=CafeOut)
def my_cafe(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.cafe_id:
        raise HTTPException(status_code=404, detail="Not assigned to any cafe")
    cafe = db.query(Cafe).filter_by(id=current_user.cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    return cafe
