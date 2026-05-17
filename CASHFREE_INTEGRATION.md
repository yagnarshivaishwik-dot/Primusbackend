# Cashfree Integration — Technical Overview


This document accompanies the end-to-end recording. It shows the actual backend code that handles the Cashfree integration, organised by flow phase.

---

## 1. Architecture in one paragraph

The Primus backend (FastAPI + PostgreSQL) is integrated with Cashfree's Payment Gateway in **sandbox mode**. Customers initiate UPI payments from the kiosk client; the backend creates the order via Cashfree's REST API, retrieves a UPI-QR from `/orders/sessions`, and renders it inside the kiosk. After the customer pays on their UPI app, Cashfree's servers deliver a webhook to our backend, which verifies the HMAC signature, performs replay and IP-allowlist checks, processes the event idempotently, and pushes a live update to the kiosk over WebSocket. Identical code path runs in production at `https://api.primustech.in` with `CASHFREE_ENV=production`.

---

## 2. Order creation

**Endpoint**: `POST /api/v1/payment/cashfree/create-order`
**File**: `backend/app/api/endpoints/cashfree.py`
**Auth**: JWT (customer-scoped via `get_current_user`)

```python
@router.post("/create-order", response_model=CreateOrderOut)
async def create_order(body: CreateOrderIn, current_user: User = Depends(get_current_user), ctx: AuthContext = Depends(get_auth_context)):
    """Create a Cashfree order + generate UPI QR. Order ID is server-assigned."""
    order_id = f"PRIMUS_{uuid.uuid4().hex[:16].upper()}"     # server-controlled, never client-supplied

    order = await cf.create_order(
        order_id=order_id,
        amount=body.amount,
        customer_id=str(current_user.id),                    # from JWT — never from request payload
        customer_phone=getattr(current_user, "phone", "") or "9999999999",
        customer_email=current_user.email or "kiosk@primustech.in",
        notes={"user_id": str(current_user.id), "pc_id": str(body.pc_id or ""),
               "pack_id": str(body.pack_id or ""), "cafe_id": str(ctx.cafe_id), "note": body.note or "Primus kiosk top-up"},
    )
    session_id = order.get("payment_session_id")

    # Generate a UPI-QR via Cashfree's /orders/sessions (channel=qrcode)
    qr_resp = await cf.initiate_upi_qr(payment_session_id=session_id)
    qr_data_uri = qr_resp.get("data", {}).get("payload", {}).get("qrcode")

    return CreateOrderOut(order_id=order_id, payment_session_id=session_id,
                          payment_link=cf.hosted_checkout_url(session_id),
                          qr_data_uri=qr_data_uri, ...)
```

**Notes to reviewer**:
- `order_id` is generated server-side (UUID-based, no client input); the customer cannot collide or replay.
- `customer_id`, `cafe_id`, and `user_id` are sourced from the authenticated JWT — the client never supplies them, so tampering is impossible.
- `order_meta.notify_url` is set to our webhook endpoint, configured via `CASHFREE_NOTIFY_URL`.

---

## 3. UPI-QR rendering

The kiosk receives `qr_data_uri` (base64 PNG) directly from the create-order response and displays it inline. No JS SDK is loaded on the kiosk side for the UPI-QR flow — the customer scans the QR with any UPI app on their phone, which interacts with Cashfree directly.

For card / netbanking / wallet flows (not used in this recording), the backend additionally returns a `payment_link` pointing at our hosted checkout launcher (`GET /api/v1/payment/cashfree/checkout?session_id=...`), which loads `sdk.cashfree.com/js/v3/cashfree.js` and invokes `cashfree.checkout({ paymentSessionId })`.





---

## 4. Webhook handling

**Endpoint**: `POST /api/v1/payment/cashfree/webhook`
**File**: `backend/app/api/endpoints/cashfree.py`
**Auth**: HMAC signature (NO JWT — Cashfree's servers can't carry a JWT)

The handler runs **four sequential checks** before touching the database. Any one failing rejects the webhook:

### 4.1  IP allowlist (defense-in-depth #1)

```python
allowed_raw = os.getenv("CASHFREE_WEBHOOK_ALLOWED_CIDRS") or ""
if allowed_raw:
    nets = [ipaddress.ip_network(t.strip(), strict=False) for t in allowed_raw.split(",") if t.strip()]
    if not any(ipaddress.ip_address(client_ip) in n for n in nets):
        raise HTTPException(status_code=403, detail="Webhook source IP not permitted")
```

Configured via `CASHFREE_WEBHOOK_ALLOWED_CIDRS`. Honors `X-Forwarded-For` only when the direct peer is a trusted proxy CIDR (matches our nginx layer).

### 4.2  Timestamp window (defense-in-depth #2 — anti-replay)

```python
max_skew = int(os.getenv("CASHFREE_WEBHOOK_MAX_SKEW_SEC", "300"))
ts_int = int(request.headers.get("x-webhook-timestamp"))
if abs(int(time.time()) - ts_int) > max_skew:
    raise HTTPException(status_code=401, detail="Webhook timestamp outside permitted window")
```

Rejects anything older than 5 minutes (configurable). Prevents replay of a captured `(sig, ts, body)` triple.

### 4.3  HMAC signature

```python
if not cf.verify_webhook_signature(raw_body=raw, timestamp=timestamp, received_signature=signature):
    raise HTTPException(status_code=401, detail="Invalid webhook signature")
```

`verify_webhook_signature` (in `cashfree_service.py`) tries 5 known Cashfree signing schemes (base64 + hex variants, with/without timestamp prefix) using `CASHFREE_WEBHOOK_SECRET`. Returns True if any matches — gives forward-compat across Cashfree dashboard API version upgrades.

### 4.4  Event filter

```python
if event_type not in {"PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_SUCCESS"}: return {"ok": True, "ignored": event_type}
if payment_status and payment_status != "SUCCESS": return {"ok": True, "ignored": f"status={payment_status}"}
```

Ignores intermediate / failed events with a 200 OK so Cashfree doesn't retry indefinitely; only acts on terminal SUCCESS.

### 4.5  Idempotency

```python
existing = db.query(WalletTransaction).filter(WalletTransaction.description.like(f"%cashfree:{order_id}%")).first()
if existing:
    return {"ok": True, "already_processed": True}
```

A wallet-ledger row tagged with the order_id acts as the idempotency key. A retried webhook for the same order is a no-op — the customer is never double-credited.

### 4.6  Crediting the customer

After all checks pass, we credit either:
- The wallet (top-ups): `WalletTransaction` row created, balance updated atomically.
- A time-pack (`UserOffer`): minutes added to the customer's session quota.

Then we publish a Redis invalidation event and broadcast a live update over WebSocket so the kiosk sees the change in real time.







---

## 5. End-to-end sequence

```
Customer clicks Pay
    │
    ▼
kiosk → POST /api/v1/payment/cashfree/create-order  (JWT)
    │
    ▼
backend → Cashfree /orders            (App ID + Secret Key)
backend → Cashfree /orders/sessions   (gets base64 UPI-QR)
    │
    ▼
backend ← payment_session_id + qr_data_uri
    │
    ▼
kiosk renders QR; customer scans with UPI app
    │
    ▼  (out-of-band)
customer's UPI app → Cashfree → bank → settlement
    │
    ▼
Cashfree → POST /api/v1/payment/cashfree/webhook  (HMAC-signed)
    │
    ▼
backend: IP check → timestamp check → signature check → idempotency check
    │
    ▼
backend: credit wallet / activate time-pack
backend: publish Redis invalidation
backend: broadcast WS event to kiosk
    │
    ▼
kiosk: balance updates in real time
```

---

## 6. Configuration

All Cashfree-specific configuration is environment-variable driven:

| Variable | Purpose |
|---|---|
| `CASHFREE_APP_ID` | Merchant App ID (TEST… for sandbox) |
| `CASHFREE_SECRET_KEY` | Merchant Secret Key |
| `CASHFREE_ENV` | `sandbox` or `production` |
| `CASHFREE_WEBHOOK_SECRET` | Shared secret for HMAC verification |
| `CASHFREE_NOTIFY_URL` | Webhook target — sent in `order_meta` so Cashfree knows where to POST |
| `CASHFREE_RETURN_URL` | Post-payment redirect target |
| `CASHFREE_WEBHOOK_ALLOWED_CIDRS` | Comma-separated CIDR allowlist for webhook source IPs |
| `CASHFREE_WEBHOOK_MAX_SKEW_SEC` | Timestamp window (default 300) |

In production these point to `api.primustech.in`; in development to `localhost:8000`. The merchant App ID, Secret Key, and Webhook Secret are independent per environment.

---

## 7. Local-vs-production note

This recording was captured from a local development environment running against Cashfree **sandbox**. The integration code path is identical in production — only the four environment variables (`CASHFREE_ENV`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_WEBHOOK_SECRET`) change. The production webhook URL is `https://api.primustech.in/api/v1/payment/cashfree/webhook`, publicly reachable by Cashfree's servers.
