from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.db.dependencies import get_cafe_db as get_db
from app.models import (
    ClientPC,
    CoinTransaction,
    PCToGroup,
    PricingRule,
    User,
    UserGroup,
    UserOffer,
    WalletTransaction,
)
from app.models import (
    Session as PCSession,
)
from app.schemas import PricingRuleIn, PricingRuleOut

router = APIRouter()


# Admin: create pricing rule
@router.post("/rule", response_model=PricingRuleOut)
def create_pricing_rule(
    rule: PricingRuleIn,
    request: Request,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    pr = PricingRule(**rule.dict(), is_active=True)
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return pr


# Admin: list pricing rules
@router.get("/rule", response_model=list[PricingRuleOut])
def list_pricing_rules(
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(PricingRule).all()


# Estimate minutes left for current user given PC pricing and offers + wallet
@router.get("/estimate-timeleft")
def estimate_time_left(
    pc_id: int,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # If we track active user on this client pc, compute for that user
    tracked_user = None
    cpc = db.query(ClientPC).filter_by(id=pc_id).first()
    if cpc and cpc.current_user_id:
        tracked_user = db.query(User).filter_by(id=cpc.current_user_id).first()
    user = tracked_user or db.query(User).filter_by(id=current_user.id).first()
    # Determine PC group
    group_map = db.query(PCToGroup).filter_by(pc_id=pc_id).first()
    group_id = group_map.group_id if group_map else None
    now = datetime.utcnow()
    rule = (
        db.query(PricingRule)
        .filter(
            PricingRule.is_active.is_(True),
            (PricingRule.group_id == group_id) | (PricingRule.group_id.is_(None)),
            (PricingRule.start_time.is_(None)) | (PricingRule.start_time <= now),
            (PricingRule.end_time.is_(None)) | (PricingRule.end_time >= now),
        )
        .order_by(PricingRule.group_id.desc())
        .first()
    )
    if not rule:
        return {"minutes": 0}
    # Apply user group discount
    rate = rule.rate_per_hour
    ug = None
    if hasattr(user, "user_group_id") and user.user_group_id:
        ug = db.query(UserGroup).filter_by(id=user.user_group_id).first()
    if ug and ug.discount_percent:
        rate = rate * max(0.0, (100.0 - ug.discount_percent)) / 100.0
    # Total hours available: sum offers hours + wallet/rate
    offers = db.query(UserOffer).filter_by(user_id=user.id).all()
    offer_hours = sum(max(0.0, uo.hours_remaining or 0.0) for uo in offers)
    wallet_hours = 0.0
    if rate > 0:
        wallet_hours = max(0.0, (user.wallet_balance or 0.0) / rate)
    total_minutes = int(round((offer_hours + wallet_hours) * 60))
    return {"minutes": total_minutes}


# Apply billing at session end (auto)
def calculate_billing(session: PCSession, db: Session):
    # Find group for PC
    group_map = db.query(PCToGroup).filter_by(pc_id=session.pc_id).first()
    group_id = group_map.group_id if group_map else None
    # Find active pricing rule (group or global)
    now = session.end_time or datetime.utcnow()
    rule = (
        db.query(PricingRule)
        .filter(
            PricingRule.is_active.is_(True),
            (PricingRule.group_id == group_id) | (PricingRule.group_id.is_(None)),
            (PricingRule.start_time.is_(None)) | (PricingRule.start_time <= now),
            (PricingRule.end_time.is_(None)) | (PricingRule.end_time >= now),
        )
        .order_by(PricingRule.group_id.desc())
        .first()
    )  # Prefer group-specific
    if not rule:
        raise HTTPException(status_code=400, detail="No pricing rule set")
    # Calculate hours
    duration_hours = (session.end_time - session.start_time).total_seconds() / 3600.0
    remaining_to_bill = duration_hours
    # First consume UserOffer hours if any
    offers = (
        db.query(UserOffer)
        .filter_by(user_id=session.user_id)
        .order_by(UserOffer.purchased_at.asc())
        .all()
    )
    for uo in offers:
        if remaining_to_bill <= 0:
            break
        if uo.hours_remaining <= 0:
            continue
        consume = min(remaining_to_bill, uo.hours_remaining)
        uo.hours_remaining -= consume
        remaining_to_bill -= consume
    # Bill remaining time at pricing rate with user group discount
    bill_rate = rule.rate_per_hour
    user = db.query(User).filter_by(id=session.user_id).first()
    if user.user_group_id:
        ug = db.query(UserGroup).filter_by(id=user.user_group_id).first()
        if ug and ug.discount_percent:
            bill_rate = bill_rate * max(0.0, (100.0 - ug.discount_percent)) / 100.0
    bill = round(remaining_to_bill * bill_rate, 2)
    if bill > 0:
        # ATOMIC UPDATE: Prevents race conditions on concurrent billing
        from sqlalchemy import update
        result = db.execute(
            update(User)
            .where(User.id == user.id, User.wallet_balance >= bill)
            .values(wallet_balance=User.wallet_balance - bill)
            .returning(User.wallet_balance)
        )
        new_balance = result.scalar_one_or_none()
        if new_balance is None:
            raise HTTPException(status_code=400, detail="Insufficient balance for billing")
    # Record transaction
    if bill > 0:
        tx = WalletTransaction(
            user_id=user.id,
            amount=-bill,
            timestamp=datetime.utcnow(),
            type="deduct",
            description=f"Session billing for {remaining_to_bill:.2f}h @ {rule.rate_per_hour}/h [{rule.name}]",
        )
        db.add(tx)
    # Coin earnings: 1 coin per minute default
    coins_earned = int(duration_hours * 60)
    if user.user_group_id:
        ug = db.query(UserGroup).filter_by(id=user.user_group_id).first()
        if ug and ug.coin_multiplier:
            coins_earned = int(coins_earned * ug.coin_multiplier)
    if coins_earned > 0:
        user.coins_balance += coins_earned
        db.add(CoinTransaction(user_id=user.id, amount=coins_earned, reason="session_playtime"))
    db.commit()

    # Audit mirror: fire-and-forget from threadpool context
    if bill > 0:
        try:
            import asyncio
            from app.services.financial_audit import mirror_to_global_async
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    mirror_to_global_async(
                        cafe_id=session.cafe_id or 0,
                        txn_type="session_billing",
                        amount=bill,
                        txn_ref=str(session.id),
                        user_id=user.id,
                        description=f"Session {session.id} billing: {remaining_to_bill:.2f}h",
                    ),
                    loop,
                )
        except Exception:
            pass  # Non-critical: never block billing

    return bill


# To use: call `calculate_billing(session, db)` at session end in your session endpoint!
