"""
Thin async wrapper around the Cashfree Payments PG API.

Docs: https://docs.cashfree.com/docs/payments-create-order
API version pinned to 2023-08-01 (stable).

Credentials come from environment variables:
  CASHFREE_APP_ID          — PG x-client-id
  CASHFREE_SECRET_KEY      — PG x-client-secret
  CASHFREE_WEBHOOK_SECRET  — HMAC-SHA256 secret used to verify inbound webhooks
  CASHFREE_ENV             — "sandbox" (default) or "production"
  CASHFREE_NOTIFY_URL      — full public URL of /api/v1/payment/cashfree/webhook
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

_API_VERSION = "2023-08-01"
# Payment Links use a newer API surface. Pinning explicitly here so a
# future bump of _API_VERSION (for the legacy orders flow) doesn't
# silently break link creation.
_PAYMENT_LINK_API_VERSION = "2025-01-01"

_BASE_URLS = {
    "sandbox": "https://sandbox.cashfree.com/pg",
    "production": "https://api.cashfree.com/pg",
}


class CashfreeNotConfiguredError(RuntimeError):
    """Raised when CASHFREE_APP_ID / CASHFREE_SECRET_KEY are missing."""


def _env(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name, default)
    return v.strip() if isinstance(v, str) else v


def _base_url() -> str:
    env = (_env("CASHFREE_ENV", "sandbox") or "sandbox").lower()
    return _BASE_URLS.get(env, _BASE_URLS["sandbox"])


def _credentials() -> tuple[str, str]:
    app_id = _env("CASHFREE_APP_ID")
    secret = _env("CASHFREE_SECRET_KEY")
    if not app_id or not secret:
        raise CashfreeNotConfiguredError(
            "Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in the environment."
        )
    return app_id, secret


def _headers() -> dict[str, str]:
    app_id, secret = _credentials()
    return {
        "x-api-version": _API_VERSION,
        "x-client-id": app_id,
        "x-client-secret": secret,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def create_order(
    *,
    order_id: str,
    amount: float,
    customer_id: str,
    customer_phone: str,
    customer_email: str,
    notes: dict | None = None,
    return_url: str | None = None,
) -> dict[str, Any]:
    """
    Create a PG order. Returns the full response including `payment_session_id`.

    `return_url` is the URL Cashfree redirects to after the user finishes
    payment (success / cancel / dropped). For the kiosk hosted-checkout
    flow this MUST be a real public HTTPS URL — Cashfree's dashboard
    rejects virtual hosts like kiosk.primustech.in. Default points at the
    backend's own /return endpoint, which the kiosk's WebView2 then
    intercepts via NavigationStarting.
    """
    body = {
        "order_id": order_id,
        "order_amount": round(float(amount), 2),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": customer_id[:50],
            "customer_phone": customer_phone or "9999999999",
            "customer_email": customer_email or "kiosk@primustech.in",
        },
        "order_meta": {
            "notify_url": _env("CASHFREE_NOTIFY_URL", "")
            or "https://api.primustech.in/api/v1/payment/cashfree/webhook",
            "return_url": (
                return_url
                or _env("CASHFREE_RETURN_URL", "")
                or "https://api.primustech.in/api/v1/payment/cashfree/return?order_id={order_id}"
            ),
        },
        "order_note": (notes or {}).get("note") or "Primus kiosk top-up",
        "order_tags": notes or {},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{_base_url()}/orders", headers=_headers(), json=body
        )
        resp.raise_for_status()
        return resp.json()


def hosted_checkout_url(payment_session_id: str) -> str:
    """
    Return the launcher URL the kiosk's child WebView2 should navigate
    to in order to start a Cashfree checkout.

    Why a launcher and not a direct Cashfree URL:
      Cashfree v3 doesn't publish a stable hosted-checkout URL pattern —
      the JS SDK constructs the redirect target internally. So we serve
      a tiny HTML page from our OWN public domain (api.primustech.in)
      that loads sdk.cashfree.com/js/v3/cashfree.js and calls
      cashfree.checkout({paymentSessionId, redirectTarget: '_self'}).
      The SDK then full-page-redirects the WebView to Cashfree's hosted
      page, which handles UPI / card / netbanking / wallets.

      Origin check: the launcher page is served from api.primustech.in —
      Cashfree already trusts this origin for webhook delivery, and the
      SDK happily renders. The kiosk's virtual host
      kiosk.primustech.in is not involved at all (which is the whole
      point — it's not whitelistable).

      The Cashfree-side return_url config still flows back to
      api.primustech.in/.../return where the kiosk's NavigationStarting
      handler intercepts and closes the payment window.

    The launcher endpoint lives at
    GET /api/v1/payment/cashfree/checkout?session_id=...  (see
    endpoints/cashfree.py). Override the public host with the
    PRIMUS_PUBLIC_API_URL env var if your deployment serves the
    backend on a non-default domain.
    """
    base = (_env("PRIMUS_PUBLIC_API_URL", "")
            or "https://api.primustech.in").rstrip("/")
    return f"{base}/api/v1/payment/cashfree/checkout?session_id={payment_session_id}"


async def initiate_upi_qr(*, payment_session_id: str) -> dict[str, Any]:
    """
    Initiate a UPI-QR payment for an existing order. Returns the QR payload:
      data.payload.qrcode   (base64 PNG data URI)
      data.payload.upi_link (fallback UPI intent URL)
    """
    body = {
        "payment_session_id": payment_session_id,
        "payment_method": {"upi": {"channel": "qrcode"}},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{_base_url()}/orders/sessions",
            headers=_headers(),
            json=body,
        )
        resp.raise_for_status()
        return resp.json()


async def get_order(order_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_base_url()}/orders/{order_id}", headers=_headers()
        )
        resp.raise_for_status()
        return resp.json()


# ---------- Payment Links ----------------------------------------------
#
# Why this exists alongside the orders API:
#   Cashfree's embedded checkout (the JS SDK that drives create_order
#   above) needs the merchant's domain whitelisted before it'll accept
#   payments. For Primus the whitelist approval is pending and the
#   workaround Cashfree themselves recommend is the Payment Links API:
#   server-side POST /pg/links with a dynamic amount returns a link_url
#   AND a base64 PNG QR code (link_qrcode). The customer scans on their
#   phone, pays on Cashfree's hosted page (no merchant origin involved),
#   and the standard PAYMENT_SUCCESS_WEBHOOK fires the same way orders do.
#
# Key differences from create_order:
#   - Uses x-api-version 2025-01-01 (Payment Links spec)
#   - Auth headers are the same x-client-id / x-client-secret
#   - Per-link expiry (default 15 min for kiosk use — links shouldn't
#     outlive an abandoned cart)
#   - Metadata goes in `link_notes` (not order_tags); the webhook handler
#     reads both.

def _payment_link_headers() -> dict[str, str]:
    h = _headers()
    h["x-api-version"] = _PAYMENT_LINK_API_VERSION
    return h


async def create_payment_link(
    *,
    link_id: str,
    amount: float,
    customer_phone: str,
    customer_email: str | None = None,
    customer_name: str | None = None,
    purpose: str = "Primus kiosk payment",
    notes: dict | None = None,
    expiry_minutes: int = 15,
    payment_methods: str | None = None,
) -> dict[str, Any]:
    """Create a Cashfree Payment Link and return the full response.

    Response shape (relevant fields):
      - link_id           merchant-side id we passed in
      - cf_link_id        Cashfree-side id (used in webhook lookups)
      - link_url          customer-facing hosted checkout URL
      - link_qrcode       base64-encoded PNG (NOT a data URI — add the
                          prefix yourself in the endpoint)
      - link_status       ACTIVE / PAID / EXPIRED / CANCELLED
      - link_amount       echoes back the amount
      - link_expiry_time  ISO 8601 timestamp

    `notes` becomes link_notes on the Cashfree side and rides along on
    every webhook for the link. We use it to carry user_id / pack_id /
    pc_id / cafe_id so the webhook handler can credit the right user
    without any DB lookup of its own.
    """
    expiry = (datetime.now(UTC) + timedelta(minutes=expiry_minutes)).isoformat()

    body: dict[str, Any] = {
        "link_id": link_id,
        "link_amount": round(float(amount), 2),
        "link_currency": "INR",
        "link_purpose": purpose,
        "customer_details": {
            "customer_phone": customer_phone or "9999999999",
        },
        "link_expiry_time": expiry,
        # No SMS / email — kiosk customer is right there at the
        # machine. Saves on Cashfree-side spam too.
        "link_notify": {"send_sms": False, "send_email": False},
        "link_meta": {
            "notify_url": _env("CASHFREE_NOTIFY_URL", "")
            or "https://api.primustech.in/api/v1/payment/cashfree/webhook",
        },
    }
    if customer_email:
        body["customer_details"]["customer_email"] = customer_email
    if customer_name:
        body["customer_details"]["customer_name"] = customer_name
    if notes:
        # Cashfree's API caps link_notes at 5 keys; everything we need
        # fits in that budget (user_id, pc_id, pack_id, cafe_id, note).
        body["link_notes"] = {str(k): str(v) for k, v in list(notes.items())[:5]}
    if payment_methods:
        body["link_meta"]["payment_methods"] = payment_methods

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{_base_url()}/links",
            headers=_payment_link_headers(),
            json=body,
        )
        resp.raise_for_status()
        return resp.json()


async def get_payment_link(link_id: str) -> dict[str, Any]:
    """Look up a Payment Link's current status. Used by the polling fallback."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_base_url()}/links/{link_id}",
            headers=_payment_link_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_order_payments(order_id: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_base_url()}/orders/{order_id}/payments", headers=_headers()
        )
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []


def verify_webhook_signature(
    *, raw_body: bytes, timestamp: str, received_signature: str
) -> bool:
    """
    Cashfree has shipped several webhook-signing schemes across API versions.
    We try each known canonical layout and return True if ANY matches the
    received signature. All schemes share HMAC-SHA256(secret, …); they differ
    only in the message body and encoding (hex vs base64).

    Schemes tried (in order):
      A. base64(HMAC(secret, timestamp + raw_body))      — 2023-08-01
      B. base64(HMAC(secret, raw_body))                  — no timestamp variant
      C. base64(HMAC(secret, timestamp + "." + raw_body))— newer v2 events
      D. hex(HMAC(secret, timestamp + raw_body))         — hex-encoded variant
      E. hex(HMAC(secret, raw_body))                     — hex no-timestamp

    A failure here only means "none of our known schemes matched". The
    caller MUST reject the webhook on False — there is intentionally no
    "trust unsigned" bypass.
    """
    secret = _env("CASHFREE_WEBHOOK_SECRET")
    if not secret or not received_signature:
        return False

    secret_b = secret.encode("utf-8")
    body_b = raw_body or b""
    ts_b = (timestamp or "").encode("utf-8")

    messages = [
        ts_b + body_b,              # A / D
        body_b,                     # B / E
        ts_b + b"." + body_b,       # C
    ]

    for msg in messages:
        digest = hmac.new(secret_b, msg, hashlib.sha256).digest()
        b64 = base64.b64encode(digest).decode("ascii")
        hex_ = digest.hex()
        if hmac.compare_digest(b64, received_signature):
            return True
        if hmac.compare_digest(hex_, received_signature):
            return True

    return False
