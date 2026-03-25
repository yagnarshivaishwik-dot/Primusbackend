from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import User, UserGroup
from app.schemas import UserGroupIn, UserGroupOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=UserGroupOut)
def create_group(
    group: UserGroupIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    if db.query(UserGroup).filter_by(name=group.name).first():
        raise HTTPException(status_code=400, detail="Group name exists")
    g = UserGroup(**group.dict())
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.get("/", response_model=list[UserGroupOut])
def list_groups(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserGroup).all()


@router.post("/assign/{user_id}/{group_id}")
def assign_user_group(
    user_id: int,
    group_id: int,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter_by(id=user_id).first()
    grp = db.query(UserGroup).filter_by(id=group_id).first()
    if not user or not grp:
        raise HTTPException(status_code=404, detail="User or group not found")
    user.user_group_id = group_id
    db.commit()
    return {"message": "Assigned"}
