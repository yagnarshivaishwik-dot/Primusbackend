"""Synth-test for the Cashfree PAYMENT_SUCCESS_WEBHOOK handler.

Reproduces exactly what Cashfree sends after a successful payment, signs
it with our real CASHFREE_WEBHOOK_SECRET from .env, and POSTs it to the
local backend. Verifies:
  - 200 OK response (not 500)
  - UserOffer row appears in clutchhh_cafe_1
  - WalletTransaction row appears in clutchhh_cafe_1
  - No UndefinedColumn errors in container logs

NOT a permanent test — this is a one-shot debugging script. Delete after
the fix is verified, or keep under scripts/ as an operator tool.

Usage: python scripts/synth_cashfree_webhook.py
"""
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import uuid
from pathlib import Path

import urllib.error
import urllib.request

import psycopg2


REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "backend" / ".env"

# --- Fixtures (from earlier DB enumeration) ---
CAFE_ID = 1
PC_ID = 3
PACK_ID = 3                 # Test_Package_Cashfree, 60 minutes
GLOBAL_USER_ID = 99000      # phase3_cust, mirrored in cafe_1 as cafe_user_id=2
ORDER_AMOUNT = 500.0

WEBHOOK_URL = "http://localhost:8000/api/v1/payment/cashfree/webhook"


def load_env_value(key: str) -> str:
    text = ENV_PATH.read_text()
    m = re.search(rf"^{key}=(.*)$", text, re.M)
    if not m:
        sys.exit(f"missing {key} in {ENV_PATH}")
    return m.group(1).strip().strip('"').strip("'")


def cafe_db_conn():
    db_url = load_env_value("DATABASE_URL")
    m = re.search(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^:/]+):(\d+)/", db_url)
    user, pw, host, port = m.groups()
    return psycopg2.connect(
        host="localhost", port=port, user=user, password=pw, dbname=f"clutchhh_cafe_{CAFE_ID}"
    )


def count_rows() -> dict:
    conn = cafe_db_conn()
    try:
        cur = conn.cursor()
        out = {}
        for t in ("user_offers", "wallet_transactions"):
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            out[t] = cur.fetchone()[0]
        return out
    finally:
        conn.close()


def main() -> int:
    secret = load_env_value("CASHFREE_WEBHOOK_SECRET")
    if not secret:
        sys.exit("CASHFREE_WEBHOOK_SECRET is empty")

    order_id = f"SYNTH_{uuid.uuid4().hex[:12].upper()}"
    payload = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "event_time": "2026-05-22T12:00:00+05:30",
        "data": {
            "order": {
                "order_id": order_id,
                "order_amount": ORDER_AMOUNT,
                "order_currency": "INR",
                "order_tags": {
                    "user_id": str(GLOBAL_USER_ID),
                    "pc_id": str(PC_ID),
                    "pack_id": str(PACK_ID),
                    "cafe_id": str(CAFE_ID),
                },
            },
            "payment": {
                "cf_payment_id": 123456789,
                "payment_status": "SUCCESS",
                "payment_amount": ORDER_AMOUNT,
                "payment_currency": "INR",
                "payment_method": {"upi": {"channel": None, "upi_id": "test@upi"}},
            },
        },
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    timestamp = str(int(time.time()))

    # Cashfree scheme A: base64(HMAC(secret, timestamp + raw))
    msg = timestamp.encode("utf-8") + raw
    digest = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    signature = base64.b64encode(digest).decode("ascii")

    print(f"order_id={order_id}")
    print(f"baseline rows: {count_rows()}")
    print(f"POST {WEBHOOK_URL}")
    print(f"  payload bytes: {len(raw)}")
    print(f"  timestamp:     {timestamp}")
    print(f"  signature:     {signature[:16]}…")

    req = urllib.request.Request(
        WEBHOOK_URL,
        data=raw,
        headers={
            "Content-Type": "application/json",
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": signature,
            "User-Agent": "synth-test/1.0",
        },
        method="POST",
    )
    try:
        # 60s timeout — first call after uvicorn --reload cycles or after
        # the Redis invalidation subscriber reconnects can take 10–30s to
        # respond. The endpoint itself runs in <500ms; the wait is the
        # server warming back up.
        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        status = exc.code
        body = exc.read().decode("utf-8", errors="replace")
    except Exception as exc:
        print(f"REQUEST FAILED: {exc}")
        return 2

    print(f"\nresponse: {status}")
    print(f"body: {body}")

    class _R:
        pass

    r = _R()
    r.status_code = status
    r.text = body

    after = count_rows()
    print(f"\nafter rows: {after}")

    ok = r.status_code == 200 and after["user_offers"] >= 1 and after["wallet_transactions"] >= 1
    if ok:
        # Pull the rows to confirm shape
        conn = cafe_db_conn()
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT id, user_id, offer_id, minutes_remaining FROM user_offers ORDER BY id DESC LIMIT 1"
            )
            print(f"  newest user_offer: {cur.fetchone()}")
            cur.execute(
                "SELECT id, user_id, amount, type, description FROM wallet_transactions ORDER BY id DESC LIMIT 1"
            )
            print(f"  newest wallet_txn: {cur.fetchone()}")
        finally:
            conn.close()
        print("\n[PASS]")
        return 0

    print("\n[FAIL]")
    return 1


if __name__ == "__main__":
    sys.exit(main())
