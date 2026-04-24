"""
Cashfree UPI-QR payment flow.

Endpoints:
  POST /api/v1/payment/cashfree/create-order   JWT  — creates order + returns QR
  GET  /api/v1/payment/cashfree/order/{id}     JWT  — polls status (fallback)
  POST /api/v1/payment/cashfree/webhook        none — Cashfree push, HMAC-auth'd

Flow:
  1. Kiosk → POST /create-order with { amount, user_id, pc_id, pack_id? }
  2. Backend → Cashfree.create_order → Cashfree.initiate_upi_qr
  3. Backend → returns { order_id, qr_data_uri, upi_link, amount }
  4. Kiosk displays QR; user scans + pays on phone
  5. Cashfree → POST /webhook (HMAC signed)
  6. Backend verifies sig → credits user (wallet or pack minutes) idempotently
  7. Backend → notify_pc(pc_id) with wallet_updated + time_updated events
  8. Kiosk modal polls /order/{id} and/or receives the realtime event, closes
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import MULTI_DB_ENABLED
from app.db.global_db import global_session_factory
from app.db.router import cafe_db_router
from app.models import Offer, User, UserOffer, WalletTransaction
from app.services import cashfree_service as cf
from app.ws.auth import build_event
from app.ws import pc as ws_pc, admin as ws_admin


def _session_for_cafe(cafe_id: int | None):
    """Pick the right SQLAlchemy session for a given cafe.

    In multi-DB mode each cafe has its own DB, so webhooks that land without
    a JWT must resolve the DB explicitly from ``order_tags.cafe_id``. In
    single-DB mode (default), both factories return the same session.
    """
    if MULTI_DB_ENABLED and cafe_id is not None:
        return cafe_db_router.get_session(cafe_id)
    return global_session_factory()

router = APIRouter()


class CreateOrderIn(BaseModel):
    amount: float = Field(..., gt=0, le=100000)
    pc_id: int | None = None
    pack_id: str | int | None = None
    note: str | None = None


class CreateOrderOut(BaseModel):
    order_id: str
    qr_data_uri: str | None = None
    upi_link: str | None = None
    amount: float
    currency: str = "INR"
    status: str


@router.post("/create-order", response_model=CreateOrderOut)
async def create_order(
    body: CreateOrderIn,
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Create a Cashfree order + generate UPI QR. Order ID is server-assigned."""
    order_id = f"PRIMUS_{uuid.uuid4().hex[:16].upper()}"

    try:
        order = await cf.create_order(
            order_id=order_id,
            amount=body.amount,
            customer_id=str(current_user.id),
            customer_phone=getattr(current_user, "phone", "") or "9999999999",
            customer_email=current_user.email or "kiosk@primustech.in",
            notes={
                "user_id": str(current_user.id),
                "pc_id": str(body.pc_id or ""),
                "pack_id": str(body.pack_id or ""),
                "cafe_id": str(ctx.cafe_id),
                "note": body.note or "Primus kiosk top-up",
            },
        )
    except cf.CashfreeNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "Cashfree API error"
        raise HTTPException(status_code=502, detail=detail) from exc

    session_id = order.get("payment_session_id")
    if not session_id:
        raise HTTPException(status_code=502, detail="Cashfree returned no payment_session_id")

    qr_data_uri: str | None = None
    upi_link: str | None = None
    try:
        qr = await cf.initiate_upi_qr(payment_session_id=session_id)
        payload = (qr.get("data") or {}).get("payload") or {}
        qr_data_uri = payload.get("qrcode") or payload.get("qr_code")
        upi_link = payload.get("upi_link") or payload.get("upi_intent")
    except httpx.HTTPStatusError:
        # QR initiation sometimes requires the JS SDK path; surface the
        # upi_link if present and let the client render QR from it.
        pass

    return CreateOrderOut(
        order_id=order_id,
        qr_data_uri=qr_data_uri,
        upi_link=upi_link,
        amount=body.amount,
        status=order.get("order_status", "ACTIVE"),
    )


@router.get("/order/{order_id}")
async def get_order_status(
    order_id: str,
    current_user: User = Depends(get_current_user),
):
    """Polling fallback for clients. Returns normalised status."""
    try:
        order = await cf.get_order(order_id)
    except cf.CashfreeNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text) from exc

    return {
        "order_id": order.get("order_id") or order_id,
        "status": order.get("order_status", "UNKNOWN"),
        "amount": float(order.get("order_amount", 0) or 0),
        "paid": order.get("order_status") == "PAID",
    }


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request):
    """
    Cashfree push notification.
    Verifies HMAC signature (header `x-webhook-signature`, `x-webhook-timestamp`)
    and, on PAYMENT_SUCCESS, credits the user's wallet + broadcasts live events.
    Idempotent: a repeat webhook for the same order does nothing.
    """
    raw = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")

    if not cf.verify_webhook_signature(
        raw_body=raw, timestamp=timestamp, received_signature=signature
    ):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        event = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook body") from exc

    event_type = event.get("type") or event.get("event_type")
    data = event.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    tags = order.get("order_tags") or {}

    order_id = order.get("order_id")
    order_amount = float(order.get("order_amount") or 0)
    payment_status = (payment.get("payment_status") or "").upper()

    # Only act on terminal success events; ignore PENDING / DROPPED.
    if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"}:
        return {"ok": True, "ignored": event_type}
    if payment_status and payment_status != "SUCCESS":
        return {"ok": True, "ignored": f"status={payment_status}"}

    user_id_s = tags.get("user_id")
    pc_id_s = tags.get("pc_id")
    cafe_id_s = tags.get("cafe_id")
    pack_id_s = tags.get("pack_id")

    try:
        user_id = int(user_id_s) if user_id_s else None
        pc_id = int(pc_id_s) if pc_id_s else None
        cafe_id = int(cafe_id_s) if cafe_id_s else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid tags on order") from None

    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id tag on order")

    # Webhooks have NO JWT — so the standard `get_cafe_db` dependency can't
    # resolve cafe_id. We take it from the order_tags we set at create-order
    # time, then open the right session manually (cafe DB in multi-DB mode,
    # global DB in single-DB mode). Always closes in the finally below.
    db = _session_for_cafe(cafe_id)
    try:
        # Idempotency: a ledger row tagged with this order_id means we already
        # processed this webhook. WalletTransaction is used purely as the ledger;
        # the actual time is credited to UserOffer below, not to wallet_balance.
        existing = (
            db.query(WalletTransaction)
            .filter(WalletTransaction.description.like(f"%cashfree:{order_id}%"))
            .first()
        )
        if existing is not None:
            return {"ok": True, "idempotent": True}

        # Resolve minutes to credit. Rule: if the order was tagged with a pack_id,
        # look up the Offer and use its `hours_minutes` (integer minutes). If not,
        # treat the amount as direct minutes (fallback for ad-hoc top-ups where
        # the kiosk wants a "₹1 = 1 minute" style flow). Never touch wallet_balance.
        offer: Offer | None = None
        minutes_to_add = 0
        try:
            pack_id_int = int(pack_id_s) if pack_id_s else None
        except (TypeError, ValueError):
            pack_id_int = None

        if pack_id_int is not None:
            offer = (
                db.query(Offer)
                .filter(Offer.id == pack_id_int, Offer.active.is_(True))
                .first()
            )
            if offer and offer.hours_minutes:
                minutes_to_add = int(offer.hours_minutes)

        if minutes_to_add <= 0:
            # Sensible fallback: one minute per rupee paid. Admins can edit the
            # Offer rows via the admin panel; this path only fires if no pack_id
            # was attached or the pack was deleted between order + webhook.
            minutes_to_add = max(1, int(round(order_amount)))

        # Ensure user actually exists (cheap sanity check before inserting).
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        # Credit TIME — UserOffer is the canonical store of remaining minutes.
        db.add(
            UserOffer(
                user_id=user_id,
                offer_id=offer.id if offer else None,
                purchased_at=datetime.now(UTC),
                minutes_remaining=minutes_to_add,
            )
        )

        # WalletTransaction acts as the audit ledger for the money side even
        # though we don't increment wallet_balance. Keeps reconciliation with
        # Cashfree's settlement reports trivial.
        db.add(
            WalletTransaction(
                user_id=user_id,
                cafe_id=cafe_id,
                amount=order_amount,
                timestamp=datetime.now(UTC),
                type="pack_purchase",
                description=f"cashfree:{order_id}:pack:{pack_id_int or 'none'}:mins:{minutes_to_add}",
            )
        )
        db.commit()
    finally:
        db.close()

    # Notify the kiosk + admin dashboards. `time_updated` tells the kiosk to
    # re-fetch billing/estimate-timeleft (authoritative) — we don't hard-code
    # the new remaining seconds here because other user_offers may exist.
    payment_payload = {
        "order_id": order_id,
        "amount": order_amount,
        "status": "PAID",
        "user_id": user_id,
        "pc_id": pc_id,
        "minutes_added": minutes_to_add,
        "pack_id": pack_id_int,
    }

    try:
        if pc_id:
            await ws_pc.notify_pc(
                pc_id, json.dumps(build_event("time_updated", {"pc_id": pc_id}))
            )
            await ws_pc.notify_pc(
                pc_id, json.dumps(build_event("payment_confirmed", payment_payload))
            )
    except Exception:
        pass

    try:
        await ws_admin.broadcast_admin(
            json.dumps(build_event("payment.confirmed", payment_payload)),
            cafe_id=cafe_id,
        )
    except Exception:
        pass

    return {
        "ok": True,
        "user_id": user_id,
        "order_id": order_id,
        "minutes_credited": minutes_to_add,
        "pack_id": pack_id_int,
    }
