from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import _normalize_password, ph, require_role
from app.db.dependencies import get_global_db as get_db
from app.models import User
from app.schemas import UserCreate, UserOut

router = APIRouter()



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
