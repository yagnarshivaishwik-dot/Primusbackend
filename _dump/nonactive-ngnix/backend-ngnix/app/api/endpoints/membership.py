from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import MembershipPackage, User, UserMembership
from app.schemas import MembershipPackageIn, MembershipPackageOut, UserMembershipOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Admin: Create new package
@router.post("/package", response_model=MembershipPackageOut)
def create_package(
    pkg: MembershipPackageIn,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    m = MembershipPackage(**pkg.dict(), active=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


# List all active packages
@router.get("/package", response_model=list[MembershipPackageOut])
def list_packages(db: Session = Depends(get_db)):
    return db.query(MembershipPackage).filter_by(active=True).all()


# User: buy a package
@router.post("/buy/{package_id}", response_model=UserMembershipOut)
def buy_package(
    package_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    pkg = db.query(MembershipPackage).filter_by(id=package_id, active=True).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    # Deduct price from wallet
    user = db.query(User).filter_by(id=current_user.id).first()
    if user.wallet_balance < pkg.price:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    user.wallet_balance -= pkg.price
    start_date = datetime.utcnow()
    end_date = start_date + timedelta(days=pkg.valid_days) if pkg.valid_days else None
    hours_remaining = pkg.hours_included
    um = UserMembership(
        user_id=user.id,
        package_id=package_id,
        start_date=start_date,
        end_date=end_date,
        hours_remaining=hours_remaining,
    )
    db.add(um)
    db.commit()
    db.refresh(um)
    return um


# User: view memberships
@router.get("/mine", response_model=list[UserMembershipOut])
def my_memberships(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserMembership).filter_by(user_id=current_user.id).all()
