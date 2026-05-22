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
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import MULTI_DB_ENABLED
from app.db.global_db import global_session_factory
from app.db.router import cafe_db_router
from app.models import User  # global model — unchanged in both modes

# Offer, UserOffer, WalletTransaction live in TWO model files:
#   - app/models.py             — legacy, has `cafe_id` column (single-DB schema)
#   - app/db/models_cafe.py     — per-cafe schema, NO cafe_id (the cafe is
#                                 implicit in which DB you're connected to)
# In multi-DB mode the webhook writes to the per-cafe Postgres instance,
# whose tables don't have cafe_id. Using the legacy models causes SQLAlchemy
# to emit INSERT ... (..., cafe_id, ...) and Postgres rejects with
# UndefinedColumn — same pattern as the chat.py / chat_messages fix.
# Without this swap, real Cashfree payments (including the Payment Links
# workaround flow) lock up: money clears at Cashfree, webhook 500s, and
# the customer's wallet / pack never credits.
#
# `WalletTransaction` alone was previously gated; `Offer` and `UserOffer`
# were missed in that first pass — they're queried + inserted against the
# same cafe-DB session inside _process_cashfree_webhook, so they need the
# same conditional treatment. Same shape as payment_cash.py:40-43.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import Offer, UserOffer, WalletTransaction  # type: ignore[no-redef]
else:
    from app.models import Offer, UserOffer, WalletTransaction  # type: ignore[no-redef]
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
    # payment_session_id is the canonical token the Cashfree JS SDK uses to
    # render the in-app checkout (including the UPI-QR pane). Kiosk calls
    # cashfree.checkout({paymentSessionId}) with this.
    payment_session_id: str
    # NEW (hosted-checkout flow): direct URL to Cashfree's own checkout page
    # for this session. The kiosk's child WebView2 navigates here directly,
    # bypassing the JS SDK entirely (and the parent-origin verification
    # that rejected kiosk.primustech.in). Origin becomes
    # payments.cashfree.com — Cashfree's own domain — so no merchant-side
    # whitelist is needed.
    payment_link: str
    # Optional server-generated QR data (legacy path; Cashfree no longer
    # returns a usable QR from /orders/sessions for most accounts). Kept
    # for forwards-compat if Cashfree re-enables it.
    qr_data_uri: str | None = None
    upi_link: str | None = None
    # Tells the client which SDK environment to initialise ("production" or
    # "sandbox") so the drop-in hits the right API.
    environment: str = "production"
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

    # Try the server-side UPI-QR generation. The original code skipped this
    # because an older Cashfree behaviour returned an SDK challenge instead
    # of a QR image. Verified against sandbox 2026-05-14: the call DOES
    # return a usable base64 PNG QR, so we attempt it and fall back to the
    # hosted-checkout flow if Cashfree refuses (e.g. some prod accounts).
    qr_data_uri: str | None = None
    upi_link: str | None = None
    try:
        qr_resp = await cf.initiate_upi_qr(payment_session_id=session_id)
        payload = (qr_resp or {}).get("data", {}).get("payload", {}) or {}
        qr_data_uri = payload.get("qrcode") or None
        upi_link = payload.get("upi_link") or payload.get("upi") or None
    except Exception:
        # Non-fatal — kiosk can still use payment_link / payment_session_id
        # via the Cashfree hosted checkout. Logged at debug level so we
        # don't spam logs in environments where this is expected to fail.
        import logging
        logging.getLogger(__name__).debug(
            "initiate_upi_qr failed for order %s; falling back to hosted checkout",
            order_id,
            exc_info=True,
        )

    import os as _os

    environment = (
        _os.getenv("CASHFREE_ENV", "production").strip().lower()
        or "production"
    )

    return CreateOrderOut(
        order_id=order_id,
        payment_session_id=session_id,
        payment_link=cf.hosted_checkout_url(session_id),
        qr_data_uri=qr_data_uri,
        upi_link=upi_link,
        environment=environment,
        amount=body.amount,
        status=order.get("order_status", "ACTIVE"),
    )


@router.get("/checkout", response_class=HTMLResponse)
async def cashfree_checkout_launcher(
    session_id: str = Query(..., min_length=1, max_length=256),
):
    """
    Tiny launcher page that loads the Cashfree v3 SDK and starts the
    hosted checkout. Served from our own public origin
    (api.primustech.in) so the SDK's parent-origin check passes — the
    kiosk's virtual host kiosk.primustech.in is never the parent here.

    Flow:
      1. Kiosk child WebView2 navigates to
         GET /api/v1/payment/cashfree/checkout?session_id=<sid>
      2. This endpoint returns HTML that loads sdk.cashfree.com/js/v3
         and calls cashfree.checkout({paymentSessionId, redirectTarget: '_self'})
      3. Cashfree SDK full-page-redirects the WebView to its hosted
         payment page (payments.cashfree.com / payments-test.cashfree.com)
      4. After payment, Cashfree redirects to the return_url from
         order_meta — i.e. /api/v1/payment/cashfree/return — which the
         kiosk WebView's NavigationStarting handler intercepts to close
         the payment window.

    Public, no auth — the session_id is itself the auth (it's a
    Cashfree-signed token tied to a specific order). Stale or invalid
    session_ids are rejected by Cashfree, not by us.
    """
    import os as _os

    # session_id format: alphanumeric + underscore + dash, ~140 chars
    safe_sid = "".join(c for c in session_id if c.isalnum() or c in "_-.")
    env = (
        _os.getenv("CASHFREE_ENV", "production").strip().lower()
        or "production"
    )
    if env not in ("sandbox", "production"):
        env = "production"

    body = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<title>Primus payment</title>"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<style>"
        "html,body{margin:0;background:#0a0d14;color:#e5e7eb;"
        "font-family:system-ui,sans-serif;height:100%;"
        "display:flex;align-items:center;justify-content:center;text-align:center}"
        ".card{padding:40px;border-radius:24px;background:#111823;"
        "border:1px solid #1f2937;max-width:420px}"
        ".spin{width:44px;height:44px;border:4px solid #3ABEFF;"
        "border-top-color:transparent;border-radius:50%;"
        "animation:spin 0.8s linear infinite;margin:0 auto 18px}"
        "@keyframes spin{to{transform:rotate(360deg)}}"
        ".title{font-size:18px;font-weight:700;margin-bottom:6px}"
        ".sub{color:#9ca3af;font-size:13px}"
        ".err{color:#fca5a5;font-size:13px;margin-top:14px}"
        "</style></head><body>"
        "<div class=\"card\">"
        "<div class=\"spin\"></div>"
        "<div class=\"title\">Connecting to secure payment</div>"
        "<div class=\"sub\">Cashfree is loading. Do not close this window.</div>"
        "<div id=\"err\" class=\"err\"></div>"
        "</div>"
        "<script src=\"https://sdk.cashfree.com/js/v3/cashfree.js\"></script>"
        "<script>"
        "(function(){"
        "var sid=" + json.dumps(safe_sid) + ";"
        "var mode=" + json.dumps(env) + ";"
        "function fail(m){document.getElementById('err').textContent=m||'Payment failed to start.';}"
        "if(typeof window.Cashfree!=='function'){fail('Cashfree SDK could not load. Check connectivity.');return;}"
        "try{"
        "var cf=window.Cashfree({mode:mode});"
        "cf.checkout({paymentSessionId:sid,redirectTarget:'_self'}).then(function(r){"
        "if(r&&r.error){fail(r.error.message||'Payment cancelled.');}"
        "}).catch(function(e){fail((e&&e.message)||'Payment error.');});"
        "}catch(e){fail((e&&e.message)||'Could not initialise Cashfree.');}"
        "})();"
        "</script>"
        "</body></html>"
    )
    # Route-specific permissive CSP — required so the Cashfree v3 SDK
    # can load from its CDN and run. The SecurityHeadersMiddleware
    # respects this and doesn't overwrite. Everything else stays under
    # the strict default.
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://sdk.cashfree.com https://*.cashfree.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data: https:; "
        "connect-src 'self' https://*.cashfree.com https://api.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com; "
        "frame-src https://*.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com; "
        "form-action 'self' https://*.cashfree.com; "
        "frame-ancestors 'none'; "
        "base-uri 'self'"
    )
    return HTMLResponse(
        content=body,
        headers={"Content-Security-Policy": csp},
    )


@router.get("/return", response_class=HTMLResponse)
async def payment_return(
    order_id: str = Query(..., min_length=1, max_length=64),
    cf_payment_id: str | None = Query(default=None),
    cf_order_status: str | None = Query(default=None),
):
    """
    Cashfree-facing return page. The kiosk's child WebView2 navigates here
    after payment completes; its NavigationStarting handler intercepts the
    request BEFORE the page actually loads, closes the payment window, and
    posts a `payment_completed` event back to the main React app.

    Even so, we serve a real HTML page here as a safety net for any path
    that doesn't intercept (e.g. a Cashfree dashboard test, or a payment
    completed in a regular browser the user opened by mistake). The page
    immediately attempts to bounce back to the kiosk via the virtual host.

    NOTE: This endpoint is intentionally PUBLIC — Cashfree must be able
    to redirect to it without a JWT. It contains no sensitive state; the
    actual money side is handled by the signed webhook.
    """
    safe_order_id = "".join(c for c in order_id if c.isalnum() or c in "_-")
    body = (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<title>Payment complete · Primus</title>"
        "<meta http-equiv=\"refresh\" content=\"1;url=https://kiosk.primustech.in/?paid=1&order_id="
        + safe_order_id
        + "\">"
        "<style>"
        "html,body{margin:0;background:#0a0d14;color:#e5e7eb;font-family:system-ui,sans-serif;"
        "height:100%;display:flex;align-items:center;justify-content:center;text-align:center}"
        ".card{padding:40px;border-radius:24px;background:#111823;border:1px solid #1f2937;max-width:420px}"
        ".tick{font-size:64px;line-height:1;margin-bottom:8px}"
        ".sub{color:#9ca3af;font-size:13px;margin-top:6px}"
        "</style></head><body><div class=\"card\">"
        "<div class=\"tick\">✅</div>"
        "<div style=\"font-size:18px;font-weight:700\">Payment received</div>"
        "<div class=\"sub\">Returning to Primus kiosk…</div>"
        "</div>"
        "<script>"
        "try{if(window.chrome&&window.chrome.webview){"
        "window.chrome.webview.postMessage(JSON.stringify({"
        "type:'payment_return',order_id:'" + safe_order_id + "'}));"
        "}}catch(e){}"
        "setTimeout(function(){"
        "location.replace('https://kiosk.primustech.in/?paid=1&order_id=" + safe_order_id + "');"
        "},800);"
        "</script>"
        "</body></html>"
    )
    return HTMLResponse(content=body)


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


# ---------- Payment Links ----------------------------------------------
#
# Workaround for the pending merchant-domain whitelist that blocks the
# embedded checkout flow. See cashfree_service.create_payment_link for
# the rationale. The kiosk side uses these two endpoints instead of
# /create-order + /order/{id}, and renders the returned QR directly.


class CreatePaymentLinkOut(BaseModel):
    link_id: str
    cf_link_id: str
    link_url: str
    qr_data_uri: str | None = None
    amount: float
    expiry: str
    status: str


@router.post("/create-payment-link", response_model=CreatePaymentLinkOut)
async def create_payment_link(
    body: CreateOrderIn,
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Create a Cashfree Payment Link + return its QR for the kiosk to display.

    Same shape of input as /create-order so the frontend can swap flows
    with a one-line change. Notes (user_id / pc_id / pack_id / cafe_id)
    are stashed in `link_notes` and surface back on the
    PAYMENT_SUCCESS_WEBHOOK so the existing credit-the-wallet logic
    works unchanged.
    """
    link_id = f"PRIMUS_{uuid.uuid4().hex[:20].upper()}"

    try:
        link = await cf.create_payment_link(
            link_id=link_id,
            amount=body.amount,
            customer_phone=getattr(current_user, "phone", "") or "9999999999",
            customer_email=current_user.email or None,
            customer_name=getattr(current_user, "name", None),
            purpose=body.note or "Primus kiosk payment",
            notes={
                "user_id": str(current_user.id),
                "pc_id": str(body.pc_id or ""),
                "pack_id": str(body.pack_id or ""),
                "cafe_id": str(ctx.cafe_id),
            },
            expiry_minutes=15,
        )
    except cf.CashfreeNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "Cashfree API error"
        raise HTTPException(status_code=502, detail=detail) from exc

    qr_b64 = link.get("link_qrcode")
    qr_data_uri = f"data:image/png;base64,{qr_b64}" if qr_b64 else None

    return CreatePaymentLinkOut(
        link_id=link.get("link_id") or link_id,
        cf_link_id=link.get("cf_link_id") or "",
        link_url=link.get("link_url") or "",
        qr_data_uri=qr_data_uri,
        amount=body.amount,
        expiry=link.get("link_expiry_time") or "",
        status=link.get("link_status") or "ACTIVE",
    )


@router.get("/link/{link_id}")
async def get_link_status(
    link_id: str,
    current_user: User = Depends(get_current_user),
):
    """Polling fallback for Payment Link status. Same shape as /order/{id}."""
    try:
        link = await cf.get_payment_link(link_id)
    except cf.CashfreeNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=exc.response.text,
        ) from exc

    status_s = link.get("link_status", "UNKNOWN")
    amount_paid = float(link.get("link_amount_paid", 0) or 0)
    amount = float(link.get("link_amount", 0) or 0)
    return {
        "link_id": link.get("link_id") or link_id,
        "status": status_s,
        "amount": amount,
        "amount_paid": amount_paid,
        # A link is "paid" when it's marked PAID OR (best-effort) when the
        # amount_paid reaches the requested amount — some Cashfree responses
        # show ACTIVE briefly after the first payment until the link is
        # marked complete by their settlement service.
        "paid": status_s == "PAID" or (amount > 0 and amount_paid >= amount),
    }


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook(request: Request):
    import ipaddress
    import logging as _log_for_webhook
    import os as _os
    import time as _time

    _log = _log_for_webhook.getLogger("cashfree.webhook")
    """
    Cashfree push notification.

    Phase 4 hardening (audit M16):
      - Source IP allowlist (CASHFREE_WEBHOOK_ALLOWED_CIDRS, comma-sep)
      - Timestamp ± window check (CASHFREE_WEBHOOK_MAX_SKEW_SEC, default 300)
      - HMAC verification (already present)
      - Idempotency (already present)
      - All four checks must pass; any one alone is a known bypass

    Verifies HMAC signature (header `x-webhook-signature`, `x-webhook-timestamp`)
    and, on PAYMENT_SUCCESS, credits the user's wallet + broadcasts live events.
    Idempotent: a repeat webhook for the same order does nothing.
    """
    # ------- Defense-in-depth #1: source IP allowlist -------
    # Resolve the remote IP, honoring nginx X-Forwarded-For only when the
    # direct peer is in our trusted-proxy CIDRs. The same logic powers
    # rate_limit.py — keep them in sync.
    _PROXY_CIDRS = ("127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
    peer = request.client.host if request.client else "0.0.0.0"
    try:
        peer_addr = ipaddress.ip_address(peer)
        proxy_trusted = any(peer_addr in ipaddress.ip_network(c) for c in _PROXY_CIDRS)
    except ValueError:
        proxy_trusted = False
    client_ip = peer
    if proxy_trusted:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            first = xff.split(",")[0].strip()
            try:
                ipaddress.ip_address(first)
                client_ip = first
            except ValueError:
                pass

    allowed_raw = (_os.getenv("CASHFREE_WEBHOOK_ALLOWED_CIDRS") or "").strip()
    if allowed_raw:
        # Cashfree publishes its production egress ranges; operators set them
        # via env. Empty value means "no IP allowlist" — discouraged in prod
        # and warned about by app.core.startup_guards in a future Phase 5.
        nets: list[ipaddress._BaseNetwork] = []
        for token in allowed_raw.split(","):
            token = token.strip()
            if not token:
                continue
            try:
                nets.append(ipaddress.ip_network(token, strict=False))
            except ValueError:
                _log.warning("cashfree webhook: ignoring invalid allowlist CIDR %r", token)
        try:
            ip_obj = ipaddress.ip_address(client_ip)
            allowed = any(ip_obj in n for n in nets)
        except ValueError:
            allowed = False
        if not allowed:
            _log.warning(
                "cashfree webhook: source IP %s not in allowlist (raw=%r); rejecting",
                client_ip, allowed_raw,
            )
            raise HTTPException(status_code=403, detail="Webhook source IP not permitted")

    raw = await request.body()
    # Cashfree has shipped 3+ header conventions over the years. Accept all
    # variants so a dashboard upgrade doesn't silently break us.
    timestamp = (
        request.headers.get("x-webhook-timestamp")
        or request.headers.get("x-cashfree-timestamp")
        or request.headers.get("x-cf-timestamp")
        or ""
    )
    signature = (
        request.headers.get("x-webhook-signature")
        or request.headers.get("x-cashfree-signature")
        or request.headers.get("x-cf-signature")
        or ""
    )

    # Log header + body shape (not secrets) so operators can diagnose any
    # signature/scheme mismatch from backend logs alone. We log at WARNING
    # level so even backends configured with LOG_LEVEL=WARNING see it.
    _log.warning(
        "cashfree webhook hit: len(raw)=%d, headers_present={ts:%s, sig:%s}, ua=%r, "
        "all_header_names=%s",
        len(raw),
        bool(timestamp),
        bool(signature),
        request.headers.get("user-agent"),
        sorted(request.headers.keys()),
    )
    if not signature or not timestamp:
        _log.warning(
            "cashfree webhook: missing signature/timestamp headers; "
            "tried x-webhook-{signature,timestamp}, x-cashfree-{signature,timestamp}, "
            "x-cf-{signature,timestamp}. Check the all_header_names log above "
            "for what Cashfree actually sent."
        )
        # Reject unsigned webhooks. Cashfree's dashboard "Test" button will
        # see 401 — that's expected; production webhooks always carry a
        # signature, and accepting unsigned bodies would let any caller
        # credit minutes to any wallet.
        raise HTTPException(
            status_code=401, detail="Missing webhook signature headers"
        )

    # ------- Defense-in-depth #2: replay window check -------
    # Cashfree timestamps are unix-epoch seconds. Reject anything more than
    # MAX_SKEW seconds away from now. This prevents an attacker who once
    # captured a valid (sig, ts, body) triple from replaying it days later.
    max_skew = int(_os.getenv("CASHFREE_WEBHOOK_MAX_SKEW_SEC", "300"))
    try:
        ts_int = int(str(timestamp).strip())
    except (TypeError, ValueError):
        _log.warning("cashfree webhook: non-numeric timestamp header %r; rejecting", timestamp)
        raise HTTPException(status_code=400, detail="Invalid timestamp header")
    now_ts = int(_time.time())
    skew = abs(now_ts - ts_int)
    if skew > max_skew:
        _log.warning(
            "cashfree webhook: timestamp skew %ds exceeds limit %ds (now=%d, ts=%d); rejecting",
            skew, max_skew, now_ts, ts_int,
        )
        raise HTTPException(status_code=401, detail="Webhook timestamp outside permitted window")

    if not cf.verify_webhook_signature(
        raw_body=raw, timestamp=timestamp, received_signature=signature
    ):
        _log.warning(
            "cashfree webhook: signature mismatch (ts=%s, sig_prefix=%s...); check CASHFREE_WEBHOOK_SECRET",
            timestamp,
            (signature or "")[:8],
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        event = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Malformed webhook body") from exc

    event_type = event.get("type") or event.get("event_type")
    data = event.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    # Payment Link events carry their metadata in `link_notes` (sometimes
    # nested under data.payment_link, sometimes flattened to data.link_notes
    # depending on event variant). order_tags is empty for these. Merge
    # both sources so the rest of the handler doesn't care which flow
    # originated the payment.
    payment_link = data.get("payment_link") or {}
    link_notes = (
        payment_link.get("link_notes")
        or data.get("link_notes")
        or {}
    )
    tags = {**(order.get("order_tags") or {}), **link_notes}

    order_id = order.get("order_id") or payment_link.get("link_id")
    order_amount = float(
        order.get("order_amount")
        or payment_link.get("link_amount")
        or 0
    )
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

        # Resolve the FK we need for the cafe-scoped INSERTs below.
        #
        # The webhook's `user_id` came from order_tags, which was set to
        # ``current_user.id`` (the GLOBAL user id) at order-create time.
        # But user_offers.user_id and wallet_transactions.user_id FK to
        # the cafe-DB-local ``users.id`` (CafeUser.id), NOT the global
        # id. Without translation:
        #   - the old User-existence sanity check (db.query(User)) used
        #     the legacy global User model against the cafe DB session →
        #     SELECT crashed with "column users.password_hash does not
        #     exist" because the cafe DB's users table is the CafeUser
        #     schema.
        #   - even if the check passed, the UserOffer INSERT below would
        #     hit a ForeignKeyViolation pointing at a row that doesn't
        #     exist in cafe.users.
        # resolve_cafe_user_fk centralises the translation + the auto-
        # provision-if-missing dance with session.py's paywall flow.
        # Single-DB mode passes through (returns global_user_id), so
        # legacy deployments are unaffected.
        from app.services.cafe_user_provisioning import resolve_cafe_user_fk
        user_fk = resolve_cafe_user_fk(
            db, global_user_id=user_id, cafe_id=cafe_id
        )
        if user_fk is None:
            raise HTTPException(
                status_code=500,
                detail="Could not provision customer in cafe DB",
            )

        # Credit TIME — UserOffer is the canonical store of remaining minutes.
        db.add(
            UserOffer(
                user_id=user_fk,
                offer_id=offer.id if offer else None,
                purchased_at=datetime.now(UTC),
                minutes_remaining=minutes_to_add,
            )
        )

        # WalletTransaction acts as the audit ledger for the money side even
        # though we don't increment wallet_balance. Keeps reconciliation with
        # Cashfree's settlement reports trivial.
        #
        # cafe_id only belongs on the legacy single-DB model; per-cafe DBs
        # have no such column (cafe is implicit in routing). Build kwargs
        # dynamically so the same call works in both modes.
        _wt_kwargs = dict(
            user_id=user_fk,
            amount=order_amount,
            timestamp=datetime.now(UTC),
            type="pack_purchase",
            description=f"cashfree:{order_id}:pack:{pack_id_int or 'none'}:mins:{minutes_to_add}",
        )
        if not MULTI_DB_ENABLED:
            _wt_kwargs["cafe_id"] = cafe_id
        db.add(WalletTransaction(**_wt_kwargs))
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
