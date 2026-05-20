"""Home-page placeholder rewards.

The kiosk home page renders three hardcoded mock quests (Daily Check-In,
Streak Master, Hour Power) until the full quest system ships (admin CRUD
+ progression engine — see TECH_DEBT.md #21). Until then, this endpoint
lets the customer claim a fixed coin amount per mock quest, once per day
per kind.

Daily idempotency is enforced by checking existing CoinTransaction rows
whose `reason` matches `placeholder_{kind}:{YYYY-MM-DD}` — no schema
change required.

When the real quest system ships, point the home page at
/api/v1/quests/{event_id}/claim instead and remove this module.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import MULTI_DB_ENABLED

if MULTI_DB_ENABLED:
    from app.db.models_cafe import CafeUser as _UserModel, CoinTransaction
    from app.db.router import cafe_db_router
else:
    from app.models import CoinTransaction, User as _UserModel  # type: ignore[no-redef]

router = APIRouter()
logger = logging.getLogger(__name__)

# Fixed coin reward per mock quest kind. Mirrors the values rendered in
# HomePage.jsx so the kiosk and backend agree on what each claim is worth.
PLACEHOLDER_REWARDS: dict[str, int] = {
    "checkin": 25,
    "streak": 25,
    "hour": 50,
}

PlaceholderKind = Literal["checkin", "streak", "hour"]


class ClaimResult(BaseModel):
    kind: str
    coins_credited: int
    new_balance: int


def _open_db(ctx: AuthContext) -> Session:
    if MULTI_DB_ENABLED:
        return cafe_db_router.get_session(ctx.cafe_id)
    from app.db.session import SessionLocal  # type: ignore[no-redef]
    return SessionLocal()


@router.get("/claim-status")
def claim_status(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Return which placeholder kinds the current user has already claimed today.

    Sourced from CoinTransaction rows whose `reason` matches
    `placeholder_{kind}:{today}` — same key the claim endpoint writes. The
    kiosk home page calls this on mount so the "Claimed" badge survives
    navigation away and back, without a separate state table.
    """
    today = datetime.utcnow().date().isoformat()
    result = {kind: False for kind in PLACEHOLDER_REWARDS}

    if not MULTI_DB_ENABLED:
        # Legacy single-DB layouts share the user record, but we still need
        # the cafe-scoped CoinTransaction query. Best-effort: return all
        # false rather than crashing.
        return result

    db = _open_db(ctx)
    try:
        # Look up the cafe-local user. If missing, nothing has been claimed
        # by definition (no rows could have been written for them yet).
        user_row = (
            db.query(_UserModel)
            .filter(_UserModel.global_user_id == current_user.id)
            .first()
        )
        if user_row is None:
            return result

        rows = (
            db.query(CoinTransaction)
            .filter(
                CoinTransaction.user_id == user_row.id,
                CoinTransaction.reason.like(f"placeholder_%:{today}"),
            )
            .all()
        )
        for r in rows:
            # reason format: "placeholder_{kind}:{date}"
            try:
                kind = r.reason.split("placeholder_", 1)[1].split(":", 1)[0]
            except (IndexError, AttributeError):
                continue
            if kind in result:
                result[kind] = True
        return result
    finally:
        db.close()


@router.post("/claim-placeholder/{kind}", response_model=ClaimResult)
def claim_placeholder(
    kind: PlaceholderKind,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Credit the fixed coin reward for a home-page mock quest.

    Idempotent within the same UTC day per (user, kind) — a second call
    returns 409 instead of crediting again. This is what stops a customer
    from spamming the Claim! button.
    """
    coins = PLACEHOLDER_REWARDS.get(kind)
    if not coins:
        # The Literal type guard already rejects unknown kinds at request
        # parse time; this is belt-and-suspenders for safety.
        raise HTTPException(status_code=400, detail=f"Unknown quest kind: {kind}")

    today = datetime.utcnow().date().isoformat()
    reason = f"placeholder_{kind}:{today}"

    db = _open_db(ctx)
    try:
        # `current_user.id` is the GLOBAL user id (auth resolves against the
        # global users table). In multi-DB mode the cafe-side row joins via
        # `global_user_id`, NOT the cafe-local `id` PK. Looking up by `id`
        # against the cafe schema is what gave us "User not found in cafe DB"
        # in QA. In legacy single-DB mode they're the same row, so `id`
        # works.
        if MULTI_DB_ENABLED:
            user_row = (
                db.query(_UserModel)
                .filter(_UserModel.global_user_id == current_user.id)
                .first()
            )
        else:
            user_row = (
                db.query(_UserModel)
                .filter(_UserModel.id == current_user.id)
                .first()
            )

        # Auto-provision the cafe-side row if missing. Customer login on the
        # kiosk doesn't currently create a CafeUser entry in the device's
        # bound cafe DB (TECH_DEBT: auth.py should provision on first login).
        # Until that's fixed, every kiosk endpoint that needs a cafe-local
        # user row would fail forever. Provisioning here on first interaction
        # is the recovery path.
        if user_row is None and MULTI_DB_ENABLED:
            user_row = _UserModel(
                global_user_id=current_user.id,
                name=getattr(current_user, "name", None) or getattr(current_user, "email", None),
                email=getattr(current_user, "email", None),
                role="client",
                wallet_balance=0,
                coins_balance=0,
            )
            db.add(user_row)
            db.flush()  # populate user_row.id for the CoinTransaction FK below
            logger.info(
                "[HOME CLAIM] auto-provisioned CafeUser for global_user_id=%s cafe_id=%s",
                current_user.id, ctx.cafe_id,
            )
        if user_row is None:
            raise HTTPException(status_code=404, detail="User not found in cafe DB")

        existing = (
            db.query(CoinTransaction)
            .filter(
                CoinTransaction.user_id == user_row.id,
                CoinTransaction.reason == reason,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=f"Already claimed today ({kind}).",
            )

        user_row.coins_balance = (user_row.coins_balance or 0) + coins
        db.add(
            CoinTransaction(
                user_id=user_row.id,
                amount=coins,
                reason=reason,
            )
        )
        db.commit()
        db.refresh(user_row)

        logger.info(
            "[HOME CLAIM] user=%s kind=%s coins=%d new_balance=%d",
            current_user.id, kind, coins, user_row.coins_balance,
        )
        return ClaimResult(
            kind=kind,
            coins_credited=coins,
            new_balance=int(user_row.coins_balance or 0),
        )
    finally:
        db.close()
