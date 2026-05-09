"""
Offer (time-package) endpoints.

This module owns the dynamic inventory the kiosk shop displays. The admin
web portal CRUDs packages here; kiosks list active packages and buy/credit
through Cashfree (see endpoints/cashfree.py for the payment flow).

Multi-DB note:
  When MULTI_DB_ENABLED=true the per-cafe database has no `cafe_id` column
  on offers — the database itself IS the cafe boundary. Same pattern as
  endpoints/coupon.py and endpoints/client_pc.py. We import the right
  ORM class conditionally and skip cafe_id payload fields and the
  scoped_query / enforce_cafe_ownership helpers in multi-DB mode.

Realtime sync:
  Every mutation broadcasts an `inventory.updated` event on both the admin
  WebSocket channel and the connected-PCs channel so the kiosk React UI
  re-fetches /api/v1/offers/ without a manual refresh.

Route ordering (FastAPI is order-sensitive):
  Static-path routes ('/mine', '/coins/balance', '/reorder', etc.) are
  declared BEFORE the parameterised '/{offer_id}' routes. If we reverse
  these, '/{offer_id}' would match first with offer_id="mine" and the
  static routes become unreachable (422 instead of 200).
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import enforce_cafe_ownership, scoped_query
from app.db.dependencies import MULTI_DB_ENABLED
from app.db.dependencies import get_cafe_db as get_db
from app.schemas import (
    CoinTransactionOut,
    OfferIn,
    OfferOut,
    OfferReorderItem,
    OfferUpdate,
    UserOfferOut,
)
from app.ws import admin as ws_admin
from app.ws import pc as ws_pc
from app.ws.auth import build_event

# Cafe-scoped tables live in the per-cafe DB when multi-DB is on. The legacy
# global model with cafe_id is still correct in single-DB mode. Querying the
# legacy class against a cafe DB session crashes with "column does not exist".
# Pattern source: endpoints/coupon.py
if MULTI_DB_ENABLED:
    from app.db.models_cafe import (  # type: ignore[no-redef]
        CafeUser as User,
        CoinTransaction,
        Coupon,
        Offer,
        UserOffer,
    )
else:
    from app.models import (  # type: ignore[no-redef]
        CoinTransaction,
        Coupon,
        Offer,
        User,
        UserOffer,
    )

log = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _new_offer_payload(payload: dict, ctx: AuthContext) -> dict:
    """Strip cafe_id when running on a cafe DB (no such column)."""
    if not MULTI_DB_ENABLED:
        payload = {**payload, "cafe_id": ctx.cafe_id}
    return payload


def _serialize(o: Offer) -> dict[str, Any]:
    """JSON-safe shape for WebSocket broadcasts."""
    return {
        "id": int(o.id),
        "name": o.name,
        "price": float(o.price) if o.price is not None else 0.0,
        "hours_minutes": int(o.hours_minutes) if o.hours_minutes is not None else 0,
        "bonus_minutes": int(getattr(o, "bonus_minutes", 0) or 0),
        "discount_percent": float(getattr(o, "discount_percent", 0) or 0),
        "active": bool(o.active),
        "display_order": int(getattr(o, "display_order", 0) or 0),
        "thumbnail_url": getattr(o, "thumbnail_url", None),
    }


async def _broadcast_inventory(
    *,
    cafe_id: int | None,
    action: str,
    offer: Offer | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Push `inventory.updated` to every admin dashboard for this cafe AND
    every connected kiosk PC, so they re-fetch /api/v1/offers/ immediately.
    Failures are logged and swallowed — the HTTP response must succeed even
    if a single WebSocket consumer is wedged.
    """
    payload: dict[str, Any] = {
        "action": action,                    # "created" | "updated" | "deleted" | "reordered" | "toggled"
        "cafe_id": cafe_id,
        "ts": datetime.now(UTC).isoformat(),
    }
    if offer is not None:
        payload["offer"] = _serialize(offer)
    if extra:
        payload.update(extra)

    msg = json.dumps(build_event("inventory.updated", payload))

    try:
        await ws_admin.broadcast_admin(msg, cafe_id=cafe_id)
    except Exception as exc:
        log.warning("inventory.updated admin broadcast failed: %s", exc)

    try:
        # PCs are global in single-DB mode; in multi-DB mode the kiosks for
        # other cafes will receive the event but their auth-scoped re-fetch
        # ignores it. Adding a per-cafe PC list is a future optimization.
        await ws_pc.broadcast(msg)
    except Exception as exc:
        log.warning("inventory.updated PC broadcast failed: %s", exc)


# ===========================================================================
# Static-path routes (declare BEFORE '/{offer_id}' — see module docstring)
# ===========================================================================

@router.post("/", response_model=OfferOut)
async def create_offer(
    offer: OfferIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Create a new time-package. Names must be unique within the cafe."""
    if db.query(Offer).filter(Offer.name == offer.name).first():
        raise HTTPException(status_code=400, detail="Offer name already exists")

    o = Offer(
        **_new_offer_payload(offer.model_dump(), ctx),
        active=True,
    )
    db.add(o)
    db.commit()
    db.refresh(o)

    await _broadcast_inventory(cafe_id=ctx.cafe_id, action="created", offer=o)
    return o


@router.get("/", response_model=list[OfferOut])
def list_offers(
    *,
    include_inactive: bool = False,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    List packages. Authenticated only (kiosk + admin both call this).

    `include_inactive=true` requires admin role — without it the soft-deleted
    rows would leak to the kiosk shop UI.
    """
    if include_inactive and current_user.role not in ("admin", "owner", "superadmin"):
        raise HTTPException(
            status_code=403,
            detail="Admin role required to view inactive offers",
        )

    if MULTI_DB_ENABLED:
        q = db.query(Offer)
    else:
        q = scoped_query(db, Offer, ctx)

    if not include_inactive:
        q = q.filter(Offer.active.is_(True))

    return q.order_by(Offer.display_order.asc(), Offer.id.asc()).all()


@router.post("/reorder")
async def reorder_offers(
    items: list[OfferReorderItem],
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Bulk update display_order. The admin drag-and-drop sends the entire
    new ordering as `[{id, display_order}, …]` in a single call so the
    write is atomic.
    """
    if not items:
        return {"ok": True, "updated": 0}

    ids = [it.id for it in items]
    rows = db.query(Offer).filter(Offer.id.in_(ids)).all()
    by_id = {r.id: r for r in rows}

    if not MULTI_DB_ENABLED:
        for r in rows:
            enforce_cafe_ownership(r, ctx)

    for it in items:
        row = by_id.get(it.id)
        if row is not None:
            row.display_order = it.display_order

    db.commit()
    await _broadcast_inventory(
        cafe_id=ctx.cafe_id,
        action="reordered",
        extra={"items": [it.model_dump() for it in items]},
    )
    return {"ok": True, "updated": len(rows)}


@router.get("/mine", response_model=list[UserOfferOut])
def my_offers(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserOffer).filter_by(user_id=current_user.id).all()


@router.get("/coins/balance")
def coin_balance(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=current_user.id).first()
    return {"coins": getattr(user, "coins_balance", 0) if user else 0}


@router.get("/coins/transactions", response_model=list[CoinTransactionOut])
def coin_transactions(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(CoinTransaction)
        .filter_by(user_id=current_user.id)
        .order_by(CoinTransaction.timestamp.desc())
        .limit(100)
        .all()
    )


# ===========================================================================
# Sub-resource routes ('/admin/...', '/buy/...', '/deactivate/...')
# These have a literal first segment so they don't collide with '/{offer_id}'.
# ===========================================================================

@router.post("/admin/add-time/{user_id}")
def admin_add_time(
    user_id: int,
    minutes: int = 60,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Admin-only: grant free minutes to any user.

    Creates a UserOffer with offer_id=NULL (admin-granted, not purchased).
    Note: parameter renamed from the legacy `hours: float` to `minutes: int`
    to match the column actually used by the rest of the system. Callers
    that still pass `hours` would have been writing to the wrong column.
    """
    if current_user.role not in ("admin", "owner", "superadmin", "staff"):
        raise HTTPException(status_code=403, detail="Admin/Staff only")
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="Minutes must be greater than 0")

    target_user = db.query(User).filter_by(id=user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(target_user, ctx)

    uo = UserOffer(
        user_id=target_user.id,
        offer_id=None,
        purchased_at=datetime.now(UTC),
        minutes_remaining=minutes,
    )
    db.add(uo)
    db.commit()
    db.refresh(uo)

    return {
        "ok": True,
        "user_id": target_user.id,
        "minutes_added": minutes,
        "user_offer_id": uo.id,
    }


@router.post("/buy/{offer_id}", response_model=UserOfferOut)
def buy_offer(
    offer_id: int,
    coupon_code: str | None = None,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Wallet-balance purchase (no Cashfree). Decrements wallet_balance
    atomically and credits a UserOffer with `offer.hours_minutes` minutes
    plus any `bonus_minutes`.

    For Cashfree purchases see /api/v1/payment/cashfree/* — that path
    creates the UserOffer in the webhook handler, not here.
    """
    offer = db.query(Offer).filter_by(id=offer_id, active=True).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(offer, ctx)

    price = float(offer.price)

    # Per-package discount baked into the price the user actually pays.
    pkg_discount = float(getattr(offer, "discount_percent", 0) or 0)
    if pkg_discount > 0:
        price = max(0.0, round(price * (100.0 - pkg_discount) / 100.0, 2))

    if coupon_code:
        cp = db.query(Coupon).filter_by(code=coupon_code).first()
        if cp and (cp.applies_to in ("*", "offer")):
            price = max(0.0, round(price * (100.0 - cp.discount_percent) / 100.0, 2))

    # ATOMIC wallet decrement — prevents concurrent-purchase race conditions.
    # The WHERE clause does the balance check at the row level, so we don't
    # need to fetch the user first.
    result = db.execute(
        update(User)
        .where(User.id == current_user.id, User.wallet_balance >= price)
        .values(wallet_balance=User.wallet_balance - price)
        .returning(User.wallet_balance)
    )
    new_balance = result.scalar_one_or_none()
    if new_balance is None:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    minutes = int(offer.hours_minutes or 0) + int(getattr(offer, "bonus_minutes", 0) or 0)
    uo = UserOffer(
        user_id=current_user.id,
        offer_id=offer.id,
        purchased_at=datetime.now(UTC),
        minutes_remaining=minutes,
    )
    db.add(uo)
    db.commit()
    db.refresh(uo)
    return uo


@router.post("/deactivate/{offer_id}")
async def deactivate_offer(
    offer_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Legacy alias — prefer DELETE /{id} (soft) or POST /{id}/toggle."""
    o = db.query(Offer).filter(Offer.id == offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(o, ctx)
    o.active = False
    db.commit()
    db.refresh(o)
    await _broadcast_inventory(cafe_id=ctx.cafe_id, action="deleted", offer=o)
    return {"message": "Offer deactivated"}


# ===========================================================================
# Parameterised '/{offer_id}' routes — declared LAST so static paths win.
# ===========================================================================

@router.get("/{offer_id}", response_model=OfferOut)
def get_offer(
    offer_id: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    o = db.query(Offer).filter(Offer.id == offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(o, ctx)
    return o


@router.patch("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: int,
    patch: OfferUpdate,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Partial update. Only the fields present in the body are written."""
    o = db.query(Offer).filter(Offer.id == offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(o, ctx)

    updates = patch.model_dump(exclude_unset=True)

    # Name uniqueness — only check if name is actually changing.
    new_name = updates.get("name")
    if new_name and new_name != o.name:
        clash = (
            db.query(Offer)
            .filter(Offer.name == new_name, Offer.id != offer_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=400, detail="Offer name already exists")

    for k, v in updates.items():
        setattr(o, k, v)

    db.commit()
    db.refresh(o)

    await _broadcast_inventory(cafe_id=ctx.cafe_id, action="updated", offer=o)
    return o


@router.delete("/{offer_id}")
async def delete_offer(
    offer_id: int,
    hard: bool = False,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Default = soft-delete (active=False). `?hard=true` removes the row.

    Hard-delete is rejected if any UserOffer references this offer, since
    historical purchases must keep their offer_id pointer for receipts.
    """
    o = db.query(Offer).filter(Offer.id == offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(o, ctx)

    if hard:
        in_use = db.query(UserOffer).filter(UserOffer.offer_id == offer_id).first()
        if in_use is not None:
            raise HTTPException(
                status_code=409,
                detail="Cannot hard-delete offer with historical purchases — "
                       "soft-delete (active=false) instead.",
            )
        snapshot = _serialize(o)
        db.delete(o)
        db.commit()
        await _broadcast_inventory(
            cafe_id=ctx.cafe_id,
            action="deleted",
            extra={"offer_id": offer_id, "offer": snapshot},
        )
        return {"ok": True, "deleted": offer_id, "hard": True}

    o.active = False
    db.commit()
    db.refresh(o)
    await _broadcast_inventory(cafe_id=ctx.cafe_id, action="deleted", offer=o)
    return {"ok": True, "deleted": offer_id, "hard": False}


@router.post("/{offer_id}/toggle", response_model=OfferOut)
async def toggle_offer(
    offer_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Flip the active flag — used by the admin's enable/disable switch."""
    o = db.query(Offer).filter(Offer.id == offer_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Offer not found")
    if not MULTI_DB_ENABLED:
        enforce_cafe_ownership(o, ctx)

    o.active = not bool(o.active)
    db.commit()
    db.refresh(o)
    await _broadcast_inventory(cafe_id=ctx.cafe_id, action="toggled", offer=o)
    return o
