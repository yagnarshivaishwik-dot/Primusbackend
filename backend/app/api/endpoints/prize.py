import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db
from app.models import CoinTransaction, Prize, PrizeRedemption, User
from app.schemas import PrizeIn, PrizeOut, PrizeRedemptionOut

if MULTI_DB_ENABLED:
    from app.db.models_cafe import (
        CafeUser,
        CoinTransaction as CafeCoinTransaction,
    )
    from app.db.router import cafe_db_router

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/", response_model=PrizeOut)
def create_prize(
    prize: PrizeIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    p = Prize(**prize.dict(), cafe_id=ctx.cafe_id, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/", response_model=list[PrizeOut])
def list_prizes(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    return scoped_query(db, Prize, ctx).filter(Prize.active.is_(True)).all()


@router.post("/redeem/{prize_id}", response_model=PrizeRedemptionOut)
def redeem_prize(
    prize_id: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Redeem a prize for coins.

    Multi-DB note: prize metadata + stock + redemption rows live on the
    cafe DB (`db` here is the cafe session via `get_cafe_db`). The
    customer's coins balance, however, sits on `CafeUser` in the same
    cafe DB — NOT on the global `User` row that legacy single-DB layouts
    use. Earlier this endpoint decremented `User.coins_balance` (global)
    which silently never showed up in the UI because
    `/api/v1/wallet/balance` reads `CafeUser` in multi-DB mode. The
    branch below mirrors the pattern used by `home.py` /
    `quests.py`: in multi-DB, look up the cafe-local user, debit there,
    and write the CoinTransaction audit row on the cafe schema.
    """
    prize = db.query(Prize).filter_by(id=prize_id, active=True).first()
    if not prize:
        raise HTTPException(status_code=404, detail="Prize not found")
    enforce_cafe_ownership(prize, ctx)

    if MULTI_DB_ENABLED:
        # Cafe-side row + CoinTransaction belong on the same cafe DB.
        cafe_db = cafe_db_router.get_session(ctx.cafe_id)
        try:
            user_row = (
                cafe_db.query(CafeUser)
                .filter(CafeUser.global_user_id == current_user.id)
                .first()
            )
            if user_row is None:
                # Auto-provision (same recovery path as home.py / quests.py).
                user_row = CafeUser(
                    global_user_id=current_user.id,
                    name=getattr(current_user, "name", None) or getattr(current_user, "email", None),
                    email=getattr(current_user, "email", None),
                    role="client",
                    wallet_balance=0,
                    coins_balance=0,
                )
                cafe_db.add(user_row)
                cafe_db.flush()
                logger.info(
                    "[PRIZE REDEEM] auto-provisioned CafeUser for global_user_id=%s cafe_id=%s",
                    current_user.id, ctx.cafe_id,
                )

            if (user_row.coins_balance or 0) < prize.coin_cost:
                raise HTTPException(status_code=400, detail="Not enough coins")
            if prize.stock is not None and prize.stock <= 0:
                raise HTTPException(status_code=400, detail="Out of stock")

            user_row.coins_balance = (user_row.coins_balance or 0) - prize.coin_cost
            cafe_db.add(
                CafeCoinTransaction(
                    user_id=user_row.id,
                    amount=-prize.coin_cost,
                    reason=f"prize_redeem:{prize.id}",
                )
            )
            cafe_db.commit()
        finally:
            cafe_db.close()

        # Prize stock + redemption row stay on the cafe-scoped `db`
        # session (same DB as prize itself).
        prize.stock = (prize.stock or 0) - 1
        r = PrizeRedemption(
            user_id=current_user.id,
            prize_id=prize.id,
            timestamp=datetime.utcnow(),
            status="pending",
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        return r

    # Legacy single-DB path: everything sits on the global User row.
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
