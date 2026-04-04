from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query
from app.db.dependencies import get_cafe_db as get_db
from app.models import User, UserGroup
from app.schemas import UserGroupIn, UserGroupOut

router = APIRouter()


@router.post("/", response_model=UserGroupOut)
def create_group(
    group: UserGroupIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if db.query(UserGroup).filter_by(name=group.name, cafe_id=ctx.cafe_id).first():
        raise HTTPException(status_code=400, detail="Group name exists")
    g = UserGroup(**group.dict(), cafe_id=ctx.cafe_id)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.get("/", response_model=list[UserGroupOut])
def list_groups(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    return scoped_query(db, UserGroup, ctx).all()


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
