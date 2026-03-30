from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.database import SessionLocal
from app.models import Coupon, CouponRedemption
from app.schemas import CouponIn, CouponOut, CouponRedeemIn, CouponRedemptionOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=CouponOut)
def create_coupon(
    c: CouponIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if db.query(Coupon).filter_by(code=c.code).first():
        raise HTTPException(status_code=400, detail="Code exists")
    cp = Coupon(**c.dict(), cafe_id=ctx.cafe_id, times_used=0)
    db.add(cp)
    db.commit()
    db.refresh(cp)
    return cp


@router.get("/", response_model=list[CouponOut])
def list_coupons(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    return scoped_query(db, Coupon, ctx).all()


@router.post("/redeem", response_model=CouponRedemptionOut)
def redeem_coupon(
    body: CouponRedeemIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    cp = db.query(Coupon).filter_by(code=body.code).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Invalid code")
    enforce_cafe_ownership(cp, ctx)
    if cp.expires_at and cp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Coupon expired")
    if cp.max_uses and cp.times_used >= cp.max_uses:
        raise HTTPException(status_code=400, detail="Coupon max uses reached")
    # Basic per-user limit check
    if cp.per_user_limit:
        count = (
            db.query(CouponRedemption).filter_by(coupon_id=cp.id, user_id=current_user.id).count()
        )
        if count >= cp.per_user_limit:
            raise HTTPException(status_code=400, detail="Coupon per-user limit reached")
    # Mark as used (actual discount application occurs at purchase time; here we just record the entitlement)
    red = CouponRedemption(coupon_id=cp.id, user_id=current_user.id, timestamp=datetime.utcnow())
    db.add(red)
    cp.times_used += 1
    db.commit()
    db.refresh(red)
    return red
