from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import _normalize_password, ph, require_role
from app.db.dependencies import get_global_db as get_db
from app.models import User
from app.schemas import UserCreate, UserOut

router = APIRouter()


class StaffUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None



# Cafeadmin: Add a new staff user (to own cafe)
@router.post("/add", response_model=UserOut)
def add_staff(
    staff: UserCreate,
    current_user=Depends(require_role("cafeadmin")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == staff.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    normalized = _normalize_password(staff.password)
    user_obj = User(
        name=staff.name,
        email=staff.email,
        role="staff",
        password_hash=ph.hash(normalized),
        cafe_id=current_user.cafe_id,
    )
    db.add(user_obj)
    db.commit()
    db.refresh(user_obj)
    return user_obj


# Cafeadmin: List staff for own cafe
@router.get("/", response_model=list[UserOut])
def list_staff(current_user=Depends(require_role("cafeadmin")), db: Session = Depends(get_db)):
    return db.query(User).filter_by(cafe_id=current_user.cafe_id, role="staff").all()


# Cafeadmin: Update staff info
@router.patch("/{staff_id}", response_model=UserOut)
def update_staff(
    staff_id: int,
    data: StaffUpdate,
    current_user=Depends(require_role("cafeadmin")),
    db: Session = Depends(get_db),
):
    staff = db.query(User).filter_by(id=staff_id, cafe_id=current_user.cafe_id, role="staff").first()
    if not staff:
        raise HTTPException(status_code=404, detail="Staff user not found")
    if data.name is not None:
        staff.name = data.name
    if data.email is not None:
        if db.query(User).filter(User.email == data.email, User.id != staff_id).first():
            raise HTTPException(status_code=400, detail="Email already in use")
        staff.email = data.email
    if data.password is not None:
        staff.password_hash = ph.hash(_normalize_password(data.password))
    db.commit()
    db.refresh(staff)
    return staff


# Cafeadmin: Remove staff (soft delete)
@router.delete("/{staff_id}")
def remove_staff(
    staff_id: int, current_user=Depends(require_role("cafeadmin")), db: Session = Depends(get_db)
):
    staff = (
        db.query(User).filter_by(id=staff_id, cafe_id=current_user.cafe_id, role="staff").first()
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff user not found")
    db.delete(staff)
    db.commit()
    return {"message": f"Staff user {staff_id} removed"}
