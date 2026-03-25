from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import CoinTransaction, Prize, PrizeRedemption, User
from app.schemas import PrizeIn, PrizeOut, PrizeRedemptionOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=PrizeOut)
def create_prize(
    prize: PrizeIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    p = Prize(**prize.dict(), active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/", response_model=list[PrizeOut])
def list_prizes(db: Session = Depends(get_db)):
    return db.query(Prize).filter_by(active=True).all()


@router.post("/redeem/{prize_id}", response_model=PrizeRedemptionOut)
def redeem_prize(
    prize_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    prize = db.query(Prize).filter_by(id=prize_id, active=True).first()
    if not prize:
        raise HTTPException(status_code=404, detail="Prize not found")
    user = db.query(User).filter_by(id=current_user.id).first()
    if user.coins_balance < prize.coin_cost:
        raise HTTPException(status_code=400, detail="Not enough coins")
    if prize.stock <= 0:
        raise HTTPException(status_code=400, detail="Out of stock")
    user.coins_balance -= prize.coin_cost
    prize.stock -= 1
    db.add(CoinTransaction(user_id=user.id, amount=-prize.coin_cost, reason="prize_redeem"))
    r = PrizeRedemption(
        user_id=user.id, prize_id=prize.id, timestamp=datetime.utcnow(), status="pending"
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r
