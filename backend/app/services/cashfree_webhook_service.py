"""Cashfree webhook processing service.

Forensic audit BUG: the original ``app/api/endpoints/cashfree.py`` mixed HMAC
verification, replay-window enforcement, IP allow-listing, wallet credit,
UserOffer insertion, and WebSocket broadcast in a single 651-line route
handler. Tests had to spin up the whole FastAPI app just to exercise the
"PAYMENT_SUCCESS credits minutes" logic.

This module exposes :func:`process_webhook` — a pure async function that
takes the raw request body, headers, and peer IP, and returns a
:class:`WebhookResult`. The endpoint becomes a thin glue layer that parses
HTTP, calls this, and renders the response.
"""

from __future__ import annotations

import ipaddress
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Optional

from app.db.dependencies import MULTI_DB_ENABLED
from app.db.global_db import global_session_factory
from app.db.router import cafe_db_router
from app.services import cashfree_service as cf

logger = logging.getLogger("cashfree.webhook")


@dataclass
class WebhookResult:
    """Outcome of processing a single Cashfree webhook delivery."""

    ok: bool
    status_code: int = 200
    body: dict[str, Any] = field(default_factory=dict)
    # Optional broadcast payloads — endpoint dispatches to WebSocket. None
    # means no broadcast for this event (e.g. ignored event types).
    pc_broadcast: Optional[dict[str, Any]] = None
    admin_broadcast: Optional[dict[str, Any]] = None
    cafe_id: Optional[int] = None
    pc_id: Optional[int] = None


# ── helpers ──────────────────────────────────────────────────────────

_PROXY_CIDRS = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")


def _resolve_client_ip(peer: str, xff_header: str) -> str:
    """Honor X-Forwarded-For only when the direct peer is a trusted proxy."""
    try:
        peer_addr = ipaddress.ip_address(peer)
        proxy_trusted = any(peer_addr in ipaddress.ip_network(c) for c in _PROXY_CIDRS)
    except ValueError:
        proxy_trusted = False

    if proxy_trusted and xff_header:
        first = xff_header.split(",")[0].strip()
        try:
            ipaddress.ip_address(first)
            return first
        except ValueError:
            pass
    return peer


def _check_ip_allowlist(client_ip: str) -> bool:
    """Return True if the IP is permitted (or no allowlist is configured)."""
    allowed_raw = (os.getenv("CASHFREE_WEBHOOK_ALLOWED_CIDRS") or "").strip()
    if not allowed_raw:
        return True

    nets: list[ipaddress._BaseNetwork] = []
    for token in allowed_raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            nets.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            logger.warning("ignoring invalid allowlist CIDR %r", token)

    try:
        ip_obj = ipaddress.ip_address(client_ip)
    except ValueError:
        return False

    return any(ip_obj in n for n in nets)


def _session_for_cafe(cafe_id: Optional[int]):
    """Pick the right SQLAlchemy session for a given cafe."""
    if MULTI_DB_ENABLED and cafe_id is not None:
        return cafe_db_router.get_session(cafe_id)
    return global_session_factory()


def _resolve_models():
    """Resolve the right model classes for the current DB mode.

    Multi-DB mode reads cafe-scoped tables from per-cafe DBs; single-DB mode
    keeps using the legacy ``app.models`` aggregate. Resolved lazily inside
    this function so a single import-time MULTI_DB flag flip doesn't leave
    a stale binding.
    """
    if MULTI_DB_ENABLED:
        from app.db.models_cafe import Offer, UserOffer, WalletTransaction
        from app.db.models_global import UserGlobal as User
        return Offer, UserOffer, WalletTransaction, User

    from app.models import Offer, User, UserOffer, WalletTransaction
    return Offer, UserOffer, WalletTransaction, User


# ── main entry ───────────────────────────────────────────────────────

async def process_webhook(
    raw_body: bytes,
    headers: dict,
    peer_ip: str,
) -> WebhookResult:
    """Process one Cashfree webhook delivery end-to-end.

    Steps:
      1. Source IP allow-list (defense-in-depth #1).
      2. Timestamp replay window (defense-in-depth #2).
      3. HMAC signature verify (defense-in-depth #3).
      4. JSON parse + event-type filter.
      5. Idempotent credit via :class:`WalletService` (defense-in-depth #4).

    All four checks must pass; any one alone is a known bypass.
    """
    # 1. Source IP allow-list
    xff = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For") or ""
    client_ip = _resolve_client_ip(peer_ip, xff)
    if not _check_ip_allowlist(client_ip):
        logger.warning("source IP %s not in allowlist; rejecting", client_ip)
        return WebhookResult(
            ok=False, status_code=403, body={"detail": "Webhook source IP not permitted"}
        )

    # 2. Header presence
    timestamp = (
        headers.get("x-webhook-timestamp")
        or headers.get("x-cashfree-timestamp")
        or headers.get("x-cf-timestamp")
        or ""
    )
    signature = (
        headers.get("x-webhook-signature")
        or headers.get("x-cashfree-signature")
        or headers.get("x-cf-signature")
        or ""
    )

    logger.warning(
        "webhook hit: len(raw)=%d, headers_present={ts:%s, sig:%s}, ua=%r",
        len(raw_body), bool(timestamp), bool(signature),
        headers.get("user-agent"),
    )

    if not signature or not timestamp:
        return WebhookResult(
            ok=False, status_code=401, body={"detail": "Missing webhook signature headers"}
        )

    # 3. Replay-window check
    max_skew = int(os.getenv("CASHFREE_WEBHOOK_MAX_SKEW_SEC", "300"))
    try:
        ts_int = int(str(timestamp).strip())
    except (TypeError, ValueError):
        return WebhookResult(
            ok=False, status_code=400, body={"detail": "Invalid timestamp header"}
        )
    skew = abs(int(time.time()) - ts_int)
    if skew > max_skew:
        logger.warning("timestamp skew %ds exceeds limit %ds; rejecting", skew, max_skew)
        return WebhookResult(
            ok=False, status_code=401, body={"detail": "Webhook timestamp outside permitted window"}
        )

    # 4. HMAC verify
    if not cf.verify_webhook_signature(
        raw_body=raw_body, timestamp=timestamp, received_signature=signature
    ):
        return WebhookResult(
            ok=False, status_code=401, body={"detail": "Invalid webhook signature"}
        )

    # 5. JSON parse
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return WebhookResult(
            ok=False, status_code=400, body={"detail": "Malformed webhook body"}
        )

    event_type = event.get("type") or event.get("event_type")
    data = event.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    tags = order.get("order_tags") or {}

    order_id = order.get("order_id")
    order_amount = float(order.get("order_amount") or 0)
    payment_status = (payment.get("payment_status") or "").upper()

    if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"}:
        return WebhookResult(ok=True, body={"ok": True, "ignored": event_type})
    if payment_status and payment_status != "SUCCESS":
        return WebhookResult(ok=True, body={"ok": True, "ignored": f"status={payment_status}"})

    try:
        user_id = int(tags.get("user_id")) if tags.get("user_id") else None
        pc_id = int(tags.get("pc_id")) if tags.get("pc_id") else None
        cafe_id = int(tags.get("cafe_id")) if tags.get("cafe_id") else None
        pack_id_int = int(tags.get("pack_id")) if tags.get("pack_id") else None
    except (TypeError, ValueError):
        return WebhookResult(
            ok=False, status_code=400, body={"detail": "Invalid tags on order"}
        )

    if not user_id:
        return WebhookResult(
            ok=False, status_code=400, body={"detail": "Missing user_id tag on order"}
        )

    # 6. Credit — opens the correct per-cafe DB session.
    Offer, UserOffer, WalletTransaction, User = _resolve_models()
    db = _session_for_cafe(cafe_id)
    try:
        from app.services.wallet_service import WalletService

        existing = WalletService.find_existing(
            db, WalletTransaction, source="cashfree", source_ref=order_id
        )
        if existing is not None:
            return WebhookResult(ok=True, body={"ok": True, "idempotent": True})

        # Resolve pack -> minutes mapping.
        offer = None
        minutes_to_add = 0
        if pack_id_int is not None:
            offer = (
                db.query(Offer)
                .filter(Offer.id == pack_id_int, Offer.active.is_(True))
                .first()
            )
            if offer and offer.hours_minutes:
                minutes_to_add = int(offer.hours_minutes)

        if minutes_to_add <= 0:
            # Fallback: 1 minute per rupee paid.
            minutes_to_add = max(1, int(round(order_amount)))

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            return WebhookResult(
                ok=False, status_code=404, body={"detail": "User not found"}
            )

        # Credit TIME via UserOffer.
        db.add(
            UserOffer(
                user_id=user_id,
                offer_id=offer.id if offer else None,
                purchased_at=datetime.now(UTC),
                minutes_remaining=minutes_to_add,
            )
        )

        # Record audit ledger row (idempotent under (cashfree, order_id)).
        WalletService.credit(
            db,
            user_cls=User,
            wallet_transaction_cls=WalletTransaction,
            user_id=user_id,
            amount=order_amount,
            source="cashfree",
            source_ref=order_id,
            cafe_id=cafe_id,
            description=f"pack:{pack_id_int or 'none'}:mins:{minutes_to_add}",
            update_balance=False,  # money credits TIME (UserOffer), not wallet
        )
        # Override txn type to match historical pack_purchase shape.
        # (WalletService.credit defaults to 'topup'.)
        from sqlalchemy import update as _sa_update
        db.execute(
            _sa_update(WalletTransaction)
            .where(
                WalletTransaction.user_id == user_id,
                WalletTransaction.description.like(f"%cashfree:{order_id}%"),
            )
            .values(type="pack_purchase")
        )

        db.commit()
    finally:
        db.close()

    payment_payload = {
        "order_id": order_id,
        "amount": order_amount,
        "status": "PAID",
        "user_id": user_id,
        "pc_id": pc_id,
        "minutes_added": minutes_to_add,
        "pack_id": pack_id_int,
    }

    return WebhookResult(
        ok=True,
        body={
            "ok": True,
            "user_id": user_id,
            "order_id": order_id,
            "minutes_credited": minutes_to_add,
            "pack_id": pack_id_int,
        },
        pc_broadcast=payment_payload if pc_id else None,
        admin_broadcast=payment_payload,
        cafe_id=cafe_id,
        pc_id=pc_id,
    )


__all__ = ["WebhookResult", "process_webhook"]
