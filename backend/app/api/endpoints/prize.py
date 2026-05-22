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
                # auth.py auto-provisions CafeUser at login (TECH_DEBT #23).
                # If we still don't see the row here, the session predates
                # that change OR the auth-side ensure_cafe_user silently
                # failed. One last-ditch helper call before failing the
                # request — replaces a previous inline CafeUser(...).add()
                # band-aid. Note: ensure_cafe_user opens its own session
                # so it doesn't matter that we hold cafe_db here; we then
                # expire_all() to see the new row in our session.
                try:
                    from app.services.cafe_user_provisioning import ensure_cafe_user
                    ensure_cafe_user(
                        global_user_id=current_user.id,
                        cafe_id=ctx.cafe_id,
                        name=getattr(current_user, "name", None) or getattr(current_user, "email", None),
                        email=getattr(current_user, "email", None),
                    )
                    cafe_db.expire_all()
                    user_row = (
                        cafe_db.query(CafeUser)
                        .filter(CafeUser.global_user_id == current_user.id)
                        .first()
                    )
                except Exception as exc:
                    logger.warning(
                        "[PRIZE REDEEM] ensure_cafe_user fallback failed for global_user_id=%s: %s",
                        current_user.id, exc,
                    )

            if user_row is None:
                logger.warning(
                    "[PRIZE REDEEM] CafeUser missing for global_user_id=%s cafe_id=%s — "
                    "auth.py auto-provisioning may have failed; returning 409 to force re-login.",
                    current_user.id, ctx.cafe_id,
                )
                raise HTTPException(
                    status_code=409,
                    detail="Your cafe-side account is missing. Please log out and log back in to refresh your session.",
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
