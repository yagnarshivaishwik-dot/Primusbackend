from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import CoinTransaction, Coupon, Offer, User, UserOffer
from app.schemas import CoinTransactionOut, OfferIn, OfferOut, UserOfferOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=OfferOut)
def create_offer(
    offer: OfferIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    if db.query(Offer).filter(Offer.name == offer.name).first():
        raise HTTPException(status_code=400, detail="Offer name already exists")
    o = Offer(**offer.dict(), active=True)
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


@router.get("/", response_model=list[OfferOut])
def list_offers(db: Session = Depends(get_db)):
    return db.query(Offer).filter_by(active=True).all()


@router.post("/deactivate/{offer_id}")
def deactivate_offer(
    offer_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    o = db.query(Offer).filter_by(id=offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    o.active = False
    db.commit()
    return {"message": "Offer deactivated"}


@router.post("/buy/{offer_id}", response_model=UserOfferOut)
def buy_offer(
    offer_id: int,
    coupon_code: str | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    offer = db.query(Offer).filter_by(id=offer_id, active=True).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    user = db.query(User).filter_by(id=current_user.id).first()
    price = offer.price
    if coupon_code:
        cp = db.query(Coupon).filter_by(code=coupon_code).first()
        if cp and (cp.applies_to in ("*", "offer")):
            price = max(0.0, round(price * (100.0 - cp.discount_percent) / 100.0, 2))
    if user.wallet_balance < price:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    user.wallet_balance -= price
    uo = UserOffer(
        user_id=user.id,
        offer_id=offer.id,
        purchased_at=datetime.now(UTC),
        hours_remaining=offer.hours,
    )
    db.add(uo)
    db.commit()
    db.refresh(uo)
    return uo


@router.get("/mine", response_model=list[UserOfferOut])
def my_offers(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserOffer).filter_by(user_id=current_user.id).all()


@router.get("/coins/balance")
def coin_balance(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=current_user.id).first()
    return {"coins": user.coins_balance}


@router.get("/coins/transactions", response_model=list[CoinTransactionOut])
def coin_transactions(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CoinTransaction)
        .filter_by(user_id=current_user.id)
        .order_by(CoinTransaction.timestamp.desc())
        .limit(100)
        .all()
    )


# Admin: Grant free time (hours) to any user
@router.post("/admin/add-time/{user_id}")
def admin_add_time(
    user_id: int,
    hours: float = 1.0,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Admin-only: Add free time (hours) to any user.
    Creates a UserOffer with the specified hours.
    """
    if current_user.role not in ("admin", "owner", "superadmin", "staff"):
        raise HTTPException(status_code=403, detail="Admin/Staff only")
    if hours <= 0:
        raise HTTPException(status_code=400, detail="Hours must be greater than 0")
    
    target_user = db.query(User).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Create a UserOffer with the granted hours
    uo = UserOffer(
        user_id=target_user.id,
        offer_id=None,  # Admin-granted, not from a purchased offer
        purchased_at=datetime.now(UTC),
        hours_remaining=hours,
    )
    db.add(uo)
    db.commit()
    db.refresh(uo)
    
    return {
        "ok": True,
        "user_id": target_user.id,
        "hours_added": hours,
        "offer_id": uo.id,
    }

