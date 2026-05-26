"""
Stripe webhook endpoint.

P2 hardening (forensic audit BUG #23 — Stripe parity with Cashfree):
  Adds a single hardened Stripe webhook surface so the SaaS billing layer
  can credit wallets the same way Cashfree does, with:
    - Signature verification via ``stripe.Webhook.construct_event``
    - Idempotency by the Stripe event id (re-delivery is a no-op)
    - Per-event ledger row in ``wallet_transactions`` for reconciliation
    - cafe_id-scoped Postgres session in MULTI_DB mode

Endpoint:
  POST /api/v1/payment/stripe/webhook   public, Stripe-signed

The handler ONLY acts on ``checkout.session.completed`` today. Other event
types are acknowledged with 200 + ``{"ok": true, "ignored": "<type>"}`` so
Stripe doesn't retry them. Add explicit branches above the ignore line as
new flows ship (payment_intent.succeeded, invoice.paid, etc.).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, status

from app.db.dependencies import MULTI_DB_ENABLED
from app.db.global_db import global_session_factory

# Match cashfree.py — pick the right session factory based on cafe id.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import Offer, UserOffer, WalletTransaction
    from app.db.models_global import UserGlobal as User
    from app.db.router import cafe_db_router
else:
    from app.db.router import cafe_db_router  # type: ignore[no-redef]
    from app.models import Offer, User, UserOffer, WalletTransaction

_log = logging.getLogger("stripe.webhook")
router = APIRouter()


def _session_for_cafe(cafe_id: int | None):
    if MULTI_DB_ENABLED and cafe_id is not None:
        return cafe_db_router.get_session(cafe_id)
    return global_session_factory()


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request):
    """
    Stripe webhook (signature-verified, idempotent).

    Flow on ``checkout.session.completed``:
      1. Verify signature with ``stripe.Webhook.construct_event``
      2. Look up the order by ``client_reference_id`` (which we set to the
         Primus order_id at checkout time)
      3. Check the wallet_transactions ledger for an existing
         ``stripe:<event_id>`` row → if present, return ok+idempotent
      4. Otherwise credit minutes / wallet exactly like the Cashfree
         handler and insert the ledger row in the same transaction.
    """
    # Lazy import so the rest of the app boots without the stripe SDK installed
    # (it's an optional dependency until the SaaS billing rolls out).
    try:
        import stripe  # type: ignore
    except ImportError as exc:
        _log.error("stripe webhook hit but stripe SDK not installed: %s", exc)
        raise HTTPException(status_code=503, detail="Stripe SDK not installed") from exc

    webhook_secret = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
    if not webhook_secret:
        # P2-hardening: refuse to process when not configured rather than
        # silently letting unsigned events through.
        _log.warning("stripe webhook: STRIPE_WEBHOOK_SECRET unset; rejecting")
        raise HTTPException(
            status_code=503, detail="Stripe webhook not configured"
        )

    raw_body = await request.body()
    signature = request.headers.get("stripe-signature") or ""
    if not signature:
        raise HTTPException(status_code=401, detail="Missing Stripe signature")

    try:
        event = stripe.Webhook.construct_event(
            payload=raw_body,
            sig_header=signature,
            secret=webhook_secret,
        )
    except ValueError as exc:
        _log.warning("stripe webhook: malformed payload: %s", exc)
        raise HTTPException(status_code=400, detail="Malformed payload") from exc
    except stripe.error.SignatureVerificationError as exc:  # type: ignore[attr-defined]
        _log.warning("stripe webhook: signature verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Stripe signature") from exc

    event_id = event.get("id") or ""
    event_type = event.get("type") or ""
    data_obj = (event.get("data") or {}).get("object") or {}

    # Only act on terminal-success events for checkout sessions.
    if event_type != "checkout.session.completed":
        return {"ok": True, "ignored": event_type}

    payment_status = (data_obj.get("payment_status") or "").lower()
    if payment_status and payment_status != "paid":
        return {"ok": True, "ignored": f"payment_status={payment_status}"}

    client_reference_id = data_obj.get("client_reference_id") or ""
    metadata = data_obj.get("metadata") or {}
    amount_total = float((data_obj.get("amount_total") or 0)) / 100.0  # cents → INR

    # We expect the upstream code that creates the Stripe Checkout Session
    # to populate metadata with user_id / pc_id / cafe_id / pack_id — same
    # shape as Cashfree order_tags. Fall back to client_reference_id if a
    # caller forgot to set them (treated as the primary order id only).
    try:
        user_id = int(metadata.get("user_id")) if metadata.get("user_id") else None
        pc_id = int(metadata.get("pc_id")) if metadata.get("pc_id") else None
        cafe_id = int(metadata.get("cafe_id")) if metadata.get("cafe_id") else None
        pack_id = int(metadata.get("pack_id")) if metadata.get("pack_id") else None
    except (TypeError, ValueError):
        _log.warning(
            "stripe webhook: malformed metadata on event %s: %r", event_id, metadata
        )
        raise HTTPException(status_code=400, detail="Invalid event metadata") from None

    if not user_id:
        # Without a user_id we cannot credit anyone. 200 the request so
        # Stripe doesn't retry forever; operators get the log line.
        _log.warning(
            "stripe webhook: event %s missing metadata.user_id (ref=%r); skipping",
            event_id, client_reference_id,
        )
        return {"ok": True, "ignored": "missing user_id"}

    db = _session_for_cafe(cafe_id)
    try:
        # Idempotency: a ledger row tagged with this event id means we
        # already processed this webhook delivery. Re-delivery is a no-op.
        existing = (
            db.query(WalletTransaction)
            .filter(
                WalletTransaction.description.like(f"%stripe:{event_id}%")
            )
            .first()
        )
        if existing is not None:
            return {"ok": True, "idempotent": True, "event_id": event_id}

        # Minutes to credit: pack-driven if pack_id present, otherwise
        # 1 minute / unit-of-currency fallback (mirrors cashfree.py).
        offer: Offer | None = None
        minutes_to_add = 0
        if pack_id is not None:
            offer = (
                db.query(Offer)
                .filter(Offer.id == pack_id, Offer.active.is_(True))
                .first()
            )
            if offer and offer.hours_minutes:
                minutes_to_add = int(offer.hours_minutes)

        if minutes_to_add <= 0:
            minutes_to_add = max(1, int(round(amount_total)))

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        db.add(
            UserOffer(
                user_id=user_id,
                offer_id=offer.id if offer else None,
                purchased_at=datetime.now(UTC),
                minutes_remaining=minutes_to_add,
            )
        )

        wt_kwargs: dict = dict(
            user_id=user_id,
            amount=amount_total,
            timestamp=datetime.now(UTC),
            type="pack_purchase",
            description=(
                f"stripe:{event_id}:order:{client_reference_id}:"
                f"pack:{pack_id or 'none'}:mins:{minutes_to_add}"
            ),
        )
        if not MULTI_DB_ENABLED:
            wt_kwargs["cafe_id"] = cafe_id
        db.add(WalletTransaction(**wt_kwargs))
        db.commit()
    finally:
        db.close()

    # Notify the kiosk + admin dashboards (best-effort; failure shouldn't
    # roll back the already-committed credit).
    try:
        from app.ws import admin as ws_admin
        from app.ws import pc as ws_pc
        from app.ws.auth import build_event

        payload = {
            "order_id": client_reference_id,
            "event_id": event_id,
            "amount": amount_total,
            "status": "PAID",
            "user_id": user_id,
            "pc_id": pc_id,
            "minutes_added": minutes_to_add,
            "pack_id": pack_id,
        }
        if pc_id:
            await ws_pc.notify_pc(
                pc_id, json.dumps(build_event("time_updated", {"pc_id": pc_id}))
            )
            await ws_pc.notify_pc(
                pc_id, json.dumps(build_event("payment_confirmed", payload))
            )
        await ws_admin.broadcast_admin(
            json.dumps(build_event("payment.confirmed", payload)),
            cafe_id=cafe_id,
        )
    except Exception as exc:  # noqa: BLE001
        _log.warning(
            "stripe webhook: post-credit notification failed for event %s: %s",
            event_id, exc,
        )

    return {
        "ok": True,
        "event_id": event_id,
        "user_id": user_id,
        "order_id": client_reference_id,
        "minutes_credited": minutes_to_add,
        "pack_id": pack_id,
    }
