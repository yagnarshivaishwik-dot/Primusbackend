"""
Cash payment with admin confirmation — Phase 3 of the paywall trio.

Customer at the kiosk picks "Cash" on the checkout screen. A modal asks
for the cafe admin's email + password. The server validates the admin
(against the global users table via authenticate_user — never trust a
client-side compare), confirms the admin owns the kiosk's cafe, then
credits one UserOffer row per (pack × qty). A `time_updated` event is
broadcast on the per-PC WS channel so the kiosk's PackageGuard lifts
the paywall immediately, no re-login required.

Behind the feature flag `ENABLE_MANUAL_PAYMENT` so the whole endpoint
can be removed cleanly once Cashfree's embedded checkout works
end-to-end: flip the env var to disable, delete this file + unmount
the router, done.

Multi-DB note: UserOffer.user_id FKs to the cafe-local `users.id`
(CafeUser.id), not the global user id. We provision the CafeUser via
the existing cafe_user_provisioning helper before inserting offers.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import authenticate_user, get_current_user
from app.db.dependencies import MULTI_DB_ENABLED
from app.db.dependencies import get_cafe_db as get_db
from app.db.dependencies import get_global_db
from app.models import License, User, UserCafeMap
from app.services.cafe_user_provisioning import ensure_cafe_user

# Offer + UserOffer live on the cafe DB in multi-DB mode. The legacy
# global model with cafe_id is still correct in single-DB mode.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import CafeUser, Offer, UserOffer  # type: ignore[no-redef]
else:
    from app.models import Offer, UserOffer  # type: ignore[no-redef]
    CafeUser = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
router = APIRouter()


def _manual_payment_enabled() -> bool:
    """Feature flag. Default true for India launch; flip to false in env
    once Cashfree embedded checkout clears the whitelist."""
    val = os.getenv("ENABLE_MANUAL_PAYMENT", "true").strip().lower()
    return val in ("1", "true", "yes", "on")


class CashCartItem(BaseModel):
    id: int = Field(..., gt=0, description="Offer id")
    qty: int = Field(..., gt=0, le=20, description="Copies to credit")


class CashAdminCreditIn(BaseModel):
    # NB: not EmailStr — authenticate_user does an exact-case match against
    # User.email; EmailStr lowercases and would reject admins whose stored
    # email has capital letters (the 4e3b1d8 fix on the May-20 branch).
    admin_email: str
    admin_password: str
    packs: list[CashCartItem] = Field(..., min_length=1, max_length=20)
    note: str | None = Field(default=None, max_length=200)


class CashCreditOut(BaseModel):
    ok: bool
    credited: list[dict]
    total_minutes: int
    user_offer_ids: list[int]


@router.post(
    "/cash/admin-credit",
    response_model=CashCreditOut,
    status_code=status.HTTP_200_OK,
)
async def cash_admin_credit(
    body: CashAdminCreditIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    cafe_db: Session = Depends(get_db),
    global_db: Session = Depends(get_global_db),
):
    """Credit time package(s) to the kiosk's logged-in customer after a
    cafe admin confirms cash was received in person.

    Auth chain:
      1. JWT identifies the customer (current_user).
      2. Admin email/password posted in body — validated against the
         global users table; admin password is never logged.
      3. X-License-Key header identifies the kiosk's cafe; the admin
         must own that cafe (via UserCafeMap or User.cafe_id) unless
         superadmin.
      4. For each pack × qty, insert a UserOffer row with the cafe-local
         user id (CafeUser.id, NOT the global user id).
      5. Broadcast time_updated so the kiosk's PackageGuard reacts.
    """
    if not _manual_payment_enabled():
        # 404 looks like the route doesn't exist — matches flag-off intent.
        raise HTTPException(status_code=404, detail="Not Found")

    admin_email = (body.admin_email or "").strip()
    admin_password = body.admin_password or ""
    if not admin_email or not admin_password:
        raise HTTPException(
            status_code=400,
            detail="admin_email and admin_password are required",
        )

    # ---- Step 1: validate admin against global DB ----
    admin = authenticate_user(global_db, admin_email, admin_password)
    if not admin:
        logger.warning(
            "cash_admin_credit: invalid admin credentials for %r", admin_email
        )
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    if admin.role not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=403,
            detail=f"'{admin.role}' is not an admin role",
        )

    # ---- Step 2: resolve kiosk's cafe via X-License-Key ----
    license_key_header = request.headers.get("X-License-Key")
    if not license_key_header:
        raise HTTPException(
            status_code=400,
            detail="Missing X-License-Key — Cash credit requires kiosk context",
        )
    lic = (
        global_db.query(License)
        .filter_by(key=license_key_header, is_active=True)
        .first()
    )
    if not lic or not lic.cafe_id:
        raise HTTPException(status_code=400, detail="Invalid or unknown kiosk license")
    kiosk_cafe_id = lic.cafe_id

    # ---- Step 3: verify admin owns the kiosk's cafe ----
    if admin.role != "superadmin":
        admin_mapping = (
            global_db.query(UserCafeMap)
            .filter_by(user_id=admin.id, cafe_id=kiosk_cafe_id)
            .first()
        )
        if not admin_mapping and admin.cafe_id != kiosk_cafe_id:
            raise HTTPException(
                status_code=403,
                detail="Admin does not own the cafe this kiosk is bound to",
            )

    # ---- Step 4: provision the customer's CafeUser, then credit packs ----
    # ensure_cafe_user uses its own session — we then look up the row in
    # our session to get the cafe-local id for the FK.
    try:
        ensure_cafe_user(
            global_user_id=current_user.id,
            cafe_id=kiosk_cafe_id,
            email=getattr(current_user, "email", None),
            name=getattr(current_user, "name", None),
            role=getattr(current_user, "role", None) or "client",
        )
    except Exception as exc:
        logger.warning("cash_admin_credit: ensure_cafe_user failed: %s", exc)

    if MULTI_DB_ENABLED:
        cafe_user = (
            cafe_db.query(CafeUser)
            .filter(CafeUser.global_user_id == current_user.id)
            .first()
        )
        if cafe_user is None:
            # ensure_cafe_user just inserted it via a different session;
            # ours may not see it without an expire. Re-fetch fresh.
            cafe_db.expire_all()
            cafe_user = (
                cafe_db.query(CafeUser)
                .filter(CafeUser.global_user_id == current_user.id)
                .first()
            )
        if cafe_user is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to provision user in cafe DB",
            )
        user_fk = cafe_user.id
    else:
        user_fk = current_user.id

    credited: list[dict] = []
    user_offer_ids: list[int] = []
    total_minutes = 0

    for item in body.packs:
        offer = (
            cafe_db.query(Offer)
            .filter(Offer.id == item.id, Offer.active.is_(True))
            .first()
        )
        if not offer:
            raise HTTPException(
                status_code=404,
                detail=f"Offer id={item.id} not found or inactive",
            )
        minutes_per = int(offer.hours_minutes or 0)
        if minutes_per <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Offer id={item.id} has no time value",
            )

        row_ids: list[int] = []
        for _ in range(item.qty):
            uo = UserOffer(
                user_id=user_fk,
                offer_id=offer.id,
                purchased_at=datetime.utcnow(),
                minutes_remaining=minutes_per,
            )
            cafe_db.add(uo)
            cafe_db.flush()
            row_ids.append(uo.id)

        total_minutes += minutes_per * item.qty
        user_offer_ids.extend(row_ids)
        credited.append({
            "pack_id": offer.id,
            "pack_name": offer.name,
            "minutes_per": minutes_per,
            "qty": item.qty,
            "user_offer_ids": row_ids,
        })

    cafe_db.commit()

    logger.info(
        "payment.cash.credited admin=%s user=%s cafe=%s packs=%d minutes=%d",
        admin.id, current_user.id, kiosk_cafe_id, len(credited), total_minutes,
    )

    # ---- Step 5: WS broadcast so the kiosk lifts the paywall ----
    # Best-effort: don't fail the credit if WS is hiccuping. Kiosk polls
    # /active-package every 30 s as a fallback.
    #
    # ws_pc.broadcast() sends the JSON envelope to every connected client
    # PC. The kiosk's WS handler dispatches by `event` + filters on the
    # `user_id` inside payload so only the customer's own kiosk reacts.
    try:
        import json as _json
        from app.ws import pc as ws_pc
        envelope = _json.dumps({
            "event": "time_updated",
            "payload": {
                "user_id": current_user.id,
                "cafe_id": kiosk_cafe_id,
                "minutes_added": total_minutes,
                "via": "cash",
            },
        })
        await ws_pc.broadcast(envelope)
    except Exception as exc:
        logger.debug("cash_admin_credit: WS broadcast skipped (%s)", exc)

    return CashCreditOut(
        ok=True,
        credited=credited,
        total_minutes=total_minutes,
        user_offer_ids=user_offer_ids,
    )
