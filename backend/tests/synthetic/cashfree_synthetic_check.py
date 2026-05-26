"""
Cashfree synthetic monitor — runs against production every 5 minutes.

Forensic audit M22 — there is no synthetic monitor verifying the live
webhook path stays healthy between deploys. This script fires a
known-valid signed payload at the production webhook for a canary
user, then probes the read side to confirm the credit landed.

Scheduling
----------
Designed to be invoked by a systemd timer / cron / k8s CronJob every
5 minutes::

    */5 * * * * /usr/local/bin/python -m backend.tests.synthetic.cashfree_synthetic_check

Required env vars
-----------------
  CANARY_BASE_URL              — production API URL (e.g. https://api.primustech.in)
  CANARY_WEBHOOK_SECRET        — the production CASHFREE_WEBHOOK_SECRET
  CANARY_USER_ID               — id of the synthetic-test wallet user
  CANARY_CAFE_ID               — cafe id of that user
  CANARY_BEARER_TOKEN          — bearer token for the read-side probe
  PROM_PUSHGATEWAY_URL         — optional; if set, pushes synthetic_ok metric

Exit codes
----------
  0 — all steps green
  1 — webhook non-200
  2 — credit did NOT land on the canary user
  3 — Prometheus push failed (non-fatal but surfaced)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import time
import uuid
from typing import Any

import requests


def _make_signed_payload(secret: str, *, user_id: int, cafe_id: int) -> tuple[bytes, dict]:
    """Build a canonical Cashfree-signed webhook body + headers."""
    order_id = f"PRIMUS_SYN_{uuid.uuid4().hex[:12].upper()}"
    ts = str(int(time.time()))
    event = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {
                "order_id": order_id,
                "order_amount": 1.0,  # canary uses ₹1
                "order_tags": {
                    "user_id": str(user_id),
                    "cafe_id": str(cafe_id),
                    "pc_id": "",
                    "pack_id": "",
                    "synthetic": "true",
                },
            },
            "payment": {"payment_status": "SUCCESS"},
        },
    }
    body = json.dumps(event, separators=(",", ":")).encode("utf-8")
    digest = hmac.new(
        secret.encode("utf-8"), ts.encode("utf-8") + body, hashlib.sha256
    ).digest()
    signature = base64.b64encode(digest).decode("ascii")
    headers = {
        "x-webhook-signature": signature,
        "x-webhook-timestamp": ts,
        "Content-Type": "application/json",
    }
    return body, headers


def _push_metric(name: str, value: float, gateway: str) -> bool:
    """Push a single gauge to Prometheus Pushgateway."""
    try:
        url = f"{gateway.rstrip('/')}/metrics/job/cashfree_synthetic"
        payload = f"# TYPE {name} gauge\n{name} {value}\n"
        r = requests.put(url, data=payload, timeout=5)
        return r.status_code in (200, 202)
    except Exception:
        return False


def _read_canary_balance(base_url: str, bearer: str) -> int | None:
    """Probe the wallet/me endpoint and return total minutes_remaining."""
    try:
        r = requests.get(
            f"{base_url.rstrip('/')}/api/v1/wallet/me",
            headers={"Authorization": f"Bearer {bearer}"},
            timeout=10,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        # The shape varies between deployments — try common keys.
        if isinstance(data, dict):
            if "minutes_remaining" in data:
                return int(data["minutes_remaining"])
            if "wallet" in data and isinstance(data["wallet"], dict):
                return int(data["wallet"].get("minutes_remaining") or 0)
        return None
    except Exception:
        return None


def run() -> int:
    base = os.environ.get("CANARY_BASE_URL", "").rstrip("/")
    secret = os.environ.get("CANARY_WEBHOOK_SECRET", "")
    user_id = int(os.environ.get("CANARY_USER_ID", "0") or 0)
    cafe_id = int(os.environ.get("CANARY_CAFE_ID", "0") or 0)
    bearer = os.environ.get("CANARY_BEARER_TOKEN", "")
    gateway = os.environ.get("PROM_PUSHGATEWAY_URL", "")

    if not (base and secret and user_id and cafe_id and bearer):
        print("synthetic: missing one of CANARY_BASE_URL/SECRET/USER_ID/CAFE_ID/BEARER", file=sys.stderr)
        if gateway:
            _push_metric("cashfree_synthetic_misconfigured", 1, gateway)
        return 3

    pre = _read_canary_balance(base, bearer)
    body, headers = _make_signed_payload(secret, user_id=user_id, cafe_id=cafe_id)

    print(f"synthetic: posting to {base}/api/v1/payment/cashfree/webhook", file=sys.stderr)
    try:
        resp = requests.post(
            f"{base}/api/v1/payment/cashfree/webhook",
            data=body,
            headers=headers,
            timeout=15,
        )
    except Exception as exc:
        print(f"synthetic: POST failed: {exc}", file=sys.stderr)
        if gateway:
            _push_metric("cashfree_synthetic_ok", 0, gateway)
        return 1

    if resp.status_code != 200:
        print(f"synthetic: webhook returned {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
        if gateway:
            _push_metric("cashfree_synthetic_ok", 0, gateway)
        return 1

    # Give the broadcast pipeline a moment to flush; the credit itself is sync.
    time.sleep(2)
    post = _read_canary_balance(base, bearer)
    if pre is None or post is None:
        print(f"synthetic: could not read canary wallet (pre={pre} post={post})", file=sys.stderr)
        if gateway:
            _push_metric("cashfree_synthetic_ok", 0, gateway)
        return 2

    if post <= pre:
        print(
            f"synthetic: credit did NOT land (pre={pre} post={post})",
            file=sys.stderr,
        )
        if gateway:
            _push_metric("cashfree_synthetic_ok", 0, gateway)
        return 2

    print(f"synthetic: ok — canary credited (pre={pre} post={post})")
    if gateway:
        ok = _push_metric("cashfree_synthetic_ok", 1, gateway)
        _push_metric("cashfree_synthetic_credit_delta", post - pre, gateway)
        if not ok:
            return 3
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(run())
