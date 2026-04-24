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
from typing import Any

import httpx

_API_VERSION = "2023-08-01"

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
) -> dict[str, Any]:
    """
    Create a PG order. Returns the full response including `payment_session_id`
    (needed for SDK-less QR initiation below).
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
    Cashfree webhook signature scheme:
      signature = base64( HMAC-SHA256( secret, timestamp || raw_body ) )
    Header: `x-webhook-signature`
    """
    secret = _env("CASHFREE_WEBHOOK_SECRET")
    if not secret or not received_signature or not timestamp:
        return False
    msg = (timestamp or "").encode("utf-8") + (raw_body or b"")
    digest = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, received_signature)
