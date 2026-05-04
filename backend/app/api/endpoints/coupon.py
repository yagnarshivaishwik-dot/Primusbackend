from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db

# Coupon and CouponRedemption live in per-cafe databases when MULTI_DB_ENABLED
# is true (the cafe-scoped schema has no cafe_id column — each DB IS a cafe).
# In single-DB mode the legacy global model with cafe_id is still correct.
# Querying the legacy class against a cafe DB session previously crashed with
# "column coupons.cafe_id does not exist" → 500 on /api/coupon/.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import Coupon, CouponRedemption
else:
    from app.models import Coupon, CouponRedemption  # type: ignore[no-redef]
from app.schemas import CouponIn, CouponOut, CouponRedeemIn, CouponRedemptionOut

router = APIRouter()


class CouponPreviewIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=64)
    booking_amount_paise: int = Field(..., ge=0)
    cafe_id: int | None = None


class CouponPreviewOut(BaseModel):
    code: str
    original_paise: int
    discount_paise: int
    final_paise: int
    reason_if_rejected: Optional[str] = None
    verdict: Literal["ok", "rejected"]


@router.post("/", response_model=CouponOut)
def create_coupon(
    c: CouponIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if db.query(Coupon).filter_by(code=c.code).first():
        raise HTTPException(status_code=400, detail="Code exists")
    # Multi-DB note: cafe-scoped Coupon has no cafe_id column (the DB itself
    # IS the cafe). Only attach cafe_id when the column exists, i.e. the
    # legacy single-DB schema. Same pattern as client_pc.py.
    payload = c.dict()
    if not MULTI_DB_ENABLED:
        payload["cafe_id"] = ctx.cafe_id
    cp = Coupon(**payload, times_used=0)
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
    # In multi-DB mode the per-cafe DB only ever contains rows for that cafe
    # (the dependency get_cafe_db routes us there based on JWT cafe_id), so
    # we don't need scoped_query — there's no cafe_id column to filter on.
    if MULTI_DB_ENABLED:
        return db.query(Coupon).all()
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
    # In multi-DB mode the cafe DB router already enforces tenant isolation
    # (we only see coupons in this caller's cafe DB), so the cafe_id check
    # is unnecessary AND would crash because the model has no cafe_id attr.
    if not MULTI_DB_ENABLED:
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


@router.post("/preview", response_model=CouponPreviewOut)
def preview_coupon(
    body: CouponPreviewIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Dry-run a coupon against a booking amount without consuming it.

    The mobile Payment screen calls this before charging the user so the
    UI can show the final amount and the discount line item. ``redeem``
    is still the only endpoint that mutates ``times_used``.
    """

    def rejected(reason: str) -> CouponPreviewOut:
        return CouponPreviewOut(
            code=body.code,
            original_paise=body.booking_amount_paise,
            discount_paise=0,
            final_paise=body.booking_amount_paise,
            reason_if_rejected=reason,
            verdict="rejected",
        )

    cp = db.query(Coupon).filter_by(code=body.code).first()
    if not cp:
        return rejected("invalid_code")
    # Same multi-DB carve-out as redeem_coupon — see comment above.
    if not MULTI_DB_ENABLED:
        try:
            enforce_cafe_ownership(cp, ctx)
        except HTTPException:
            return rejected("not_available_at_this_cafe")
    if cp.expires_at and cp.expires_at < datetime.utcnow():
        return rejected("expired")
    if cp.max_uses and cp.times_used >= cp.max_uses:
        return rejected("max_uses_reached")
    if cp.per_user_limit:
        count = (
            db.query(CouponRedemption)
            .filter_by(coupon_id=cp.id, user_id=current_user.id)
            .count()
        )
        if count >= cp.per_user_limit:
            return rejected("per_user_limit_reached")

    # Compute the discount. Coupon model is historical and has a couple of
    # possible fields ("discount_percent", "discount_paise", "amount_off");
    # handle the common ones.
    pct = getattr(cp, "discount_percent", None) or 0
    flat_paise = int(
        getattr(cp, "discount_paise", None)
        or getattr(cp, "amount_off_paise", None)
        or 0
    )
    discount = max(
        int(body.booking_amount_paise * pct / 100) if pct else 0,
        flat_paise,
    )
    discount = min(discount, body.booking_amount_paise)
    final = max(0, body.booking_amount_paise - discount)

    return CouponPreviewOut(
        code=body.code,
        original_paise=body.booking_amount_paise,
        discount_paise=discount,
        final_paise=final,
        reason_if_rejected=None,
        verdict="ok",
    )
