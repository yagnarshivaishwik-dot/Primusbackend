"""
Integration tests for the Cashfree PG webhook.

Forensic audit BUGS verified here:
  * BUG #1  — PAYMENT_SUCCESS no longer 500s on multi-DB cafe selection
  * BUG #6  — webhook never trusts body.user_id (it lives in order_tags)
  * BUG #22 — single canonical HMAC scheme; the 5-scheme tolerance loop
              that expanded the attacker's brute-force surface is gone
  * M16    — Phase 4 hardening: timestamp window + IP allowlist
  * §A09   — audit ledger row must land for every credit attempt

Tests live in ``backend/tests/integration/`` and require:
  * the FastAPI app importable (Base/models register)
  * a clean test Postgres DB (see conftest.db_session)
  * CASHFREE_WEBHOOK_SECRET set (conftest seeds a known-good value)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

import pytest

from app.models import Offer, User, UserOffer, WalletTransaction

CASHFREE_WEBHOOK_PATH = "/api/v1/payment/cashfree/webhook"


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make_user(db, *, user_id: int = 1, email: str = "wh@test.com") -> User:
    u = User(
        id=user_id,
        name=f"webhook user {user_id}",
        email=email,
        password_hash="x",
        role="client",
        is_email_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_offer(db, *, offer_id: int = 1, minutes: int = 60, price: float = 50.0) -> Offer:
    off = Offer(
        id=offer_id,
        name=f"pack-{offer_id}",
        hours_minutes=minutes,
        price=price,
        active=True,
    )
    db.add(off)
    db.commit()
    db.refresh(off)
    return off


def _wallet_minutes(db, user_id: int) -> int:
    """Total minutes credited to the user via UserOffer rows."""
    rows = db.query(UserOffer).filter(UserOffer.user_id == user_id).all()
    return sum(int(r.minutes_remaining or 0) for r in rows)


def _audit_count(db, *, order_id: str) -> int:
    """Count WalletTransaction ledger rows for an order."""
    return (
        db.query(WalletTransaction)
        .filter(WalletTransaction.description.like(f"%cashfree:{order_id}%"))
        .count()
    )


# ── Tests ───────────────────────────────────────────────────────────────────


def test_valid_webhook_credits_wallet_once(client, db_session, cashfree_signed_payload):
    """Forensic audit BUG #1 — happy path: valid sig credits minutes once."""
    # Arrange
    user = _make_user(db_session, user_id=10, email="happy@test.com")
    offer = _make_offer(db_session, offer_id=5, minutes=120, price=99.0)
    signed = cashfree_signed_payload(
        amount=99.0,
        order_id="PRIMUS_HAPPY_001",
        user_id=user.id,
        pack_id=offer.id,
        cafe_id=1,
    )

    # Act
    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    # Assert
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("ok") is True
    assert body.get("minutes_credited") == 120
    assert _wallet_minutes(db_session, user.id) == 120
    assert _audit_count(db_session, order_id="PRIMUS_HAPPY_001") == 1


def test_duplicate_webhook_idempotent(client, db_session, cashfree_signed_payload):
    """Forensic audit BUG #1 — replaying the SAME webhook credits ONCE."""
    user = _make_user(db_session, user_id=11, email="dup@test.com")
    offer = _make_offer(db_session, offer_id=6, minutes=30, price=10.0)
    signed = cashfree_signed_payload(
        amount=10.0,
        order_id="PRIMUS_DUP_001",
        user_id=user.id,
        pack_id=offer.id,
    )

    r1 = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)
    r2 = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json().get("idempotent") is True
    # Only one credit + one ledger row.
    assert _wallet_minutes(db_session, user.id) == 30
    assert _audit_count(db_session, order_id="PRIMUS_DUP_001") == 1


def test_replay_attack_blocked_outside_timestamp_window(
    client, db_session, cashfree_signed_payload
):
    """Forensic audit M16 — timestamp 10 minutes in the past → 401."""
    _make_user(db_session, user_id=12, email="replay@test.com")
    old_ts = str(int(time.time()) - 600)  # 10 min stale
    signed = cashfree_signed_payload(
        amount=10.0,
        order_id="PRIMUS_REPLAY_001",
        user_id=12,
        timestamp=old_ts,
    )

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert resp.status_code == 401, resp.text
    assert _wallet_minutes(db_session, 12) == 0


def test_invalid_signature_blocked(client, db_session, cashfree_signed_payload):
    """Forensic audit BUG #22 — tampered sig → 401, wallet untouched."""
    _make_user(db_session, user_id=13, email="tamper@test.com")
    signed = cashfree_signed_payload(
        amount=20.0,
        order_id="PRIMUS_TAMPER_001",
        user_id=13,
    )
    bad_headers = dict(signed.headers)
    bad_headers["x-webhook-signature"] = "AAAA" + signed.signature[4:]

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=bad_headers)

    assert resp.status_code == 401
    assert _wallet_minutes(db_session, 13) == 0
    # Audit ledger must NOT carry a row for a rejected payment.
    assert _audit_count(db_session, order_id="PRIMUS_TAMPER_001") == 0


def test_db_failure_during_credit_rolls_back(
    client, db_session, cashfree_signed_payload, monkeypatch
):
    """Forensic audit §A09 — DB failure mid-commit must leave wallet untouched."""
    user = _make_user(db_session, user_id=14, email="dbfail@test.com")
    signed = cashfree_signed_payload(
        amount=15.0,
        order_id="PRIMUS_DBFAIL_001",
        user_id=user.id,
    )

    # Monkey-patch UserOffer.__init__ to raise after the model is constructed
    # but before commit. The webhook's commit() must roll back atomically.
    from app import models as _m

    original_init = _m.UserOffer.__init__

    def _raise(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        original_init(self, *args, **kwargs)
        raise RuntimeError("simulated DB write failure")

    monkeypatch.setattr(_m.UserOffer, "__init__", _raise)

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    # FastAPI surfaces a server error
    assert resp.status_code in (500, 503), resp.text
    # Roll back must have wiped the partial credit
    assert _wallet_minutes(db_session, user.id) == 0


def test_unsigned_webhook_blocked(client, db_session, cashfree_signed_payload):
    """Forensic audit BUG #22 — empty signature header → 401."""
    _make_user(db_session, user_id=15, email="unsigned@test.com")
    signed = cashfree_signed_payload(
        amount=10.0,
        order_id="PRIMUS_UNSIGNED_001",
        user_id=15,
    )

    no_sig = dict(signed.headers)
    no_sig["x-webhook-signature"] = ""

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=no_sig)

    assert resp.status_code == 401
    assert _wallet_minutes(db_session, 15) == 0


@pytest.mark.skipif(
    os.environ.get("MULTI_DB_ENABLED", "false").lower() != "true",
    reason="Multi-DB mode not active in this environment",
)
def test_multidb_uses_per_cafe_db(client, multidb_db_session, cashfree_signed_payload):
    """Forensic audit BUG #1 — in MULTI_DB mode credit must land in cafe DB."""
    # Arrange: create the user + offer in the per-cafe DB only.
    sess = multidb_db_session

    from app.db.models_cafe import Offer as CafeOffer, UserOffer as CafeUserOffer  # noqa
    from app.db.models_global import UserGlobal as User  # noqa

    user = User(
        name="multidb",
        email="multidb@test.com",
        password_hash="x",
        role="client",
        is_email_verified=True,
        cafe_id=1,
    )
    sess.add(user)
    sess.flush()
    offer = CafeOffer(name="m-pack", hours_minutes=45, price=10.0, active=True)
    sess.add(offer)
    sess.commit()

    signed = cashfree_signed_payload(
        amount=10.0,
        order_id="PRIMUS_MULTIDB_001",
        user_id=user.id,
        cafe_id=1,
        pack_id=offer.id,
    )

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert resp.status_code == 200
    credited = (
        sess.query(CafeUserOffer)
        .filter(CafeUserOffer.user_id == user.id)
        .first()
    )
    assert credited is not None
    assert credited.minutes_remaining == 45


def test_alternative_hmac_schemes_rejected(
    client, db_session, cashfree_signed_payload
):
    """Forensic audit BUG #22 — body-only legacy sig must NOT be accepted.

    The pre-cleanup verifier tolerated five schemes via OR-fallback:
        * timestamp + body          (canonical PG)
        * body only                 (legacy A)
        * timestamp.body            (with dot)
        * body in upper-case        (random folklore)
        * sha256(body) in hex       (random folklore)

    The cleanup pinned to the canonical scheme. We mint a "body-only"
    signature with the real secret and assert the endpoint rejects it.
    """
    _make_user(db_session, user_id=16, email="schemes@test.com")
    signed = cashfree_signed_payload(
        amount=12.0,
        order_id="PRIMUS_LEGACY_SIG_001",
        user_id=16,
    )
    secret = os.environ["CASHFREE_WEBHOOK_SECRET"].encode("utf-8")
    body_only_digest = hmac.new(secret, signed.body, hashlib.sha256).digest()
    legacy_sig = base64.b64encode(body_only_digest).decode("ascii")

    bad_headers = dict(signed.headers)
    bad_headers["x-webhook-signature"] = legacy_sig

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=bad_headers)

    assert resp.status_code == 401, (
        "Legacy body-only HMAC must be rejected — BUG #22 cleanup"
    )
    assert _wallet_minutes(db_session, 16) == 0


def test_ip_outside_allowlist_blocked(
    client, db_session, cashfree_signed_payload, monkeypatch
):
    """Forensic audit M16 — IP outside CASHFREE_WEBHOOK_ALLOWED_CIDRS → 403."""
    # Configure a strict allowlist that doesn't include TestClient's IP (testclient).
    monkeypatch.setenv("CASHFREE_WEBHOOK_ALLOWED_CIDRS", "203.0.113.0/24")
    _make_user(db_session, user_id=17, email="ip@test.com")
    signed = cashfree_signed_payload(
        amount=5.0,
        order_id="PRIMUS_IP_001",
        user_id=17,
    )

    resp = client.post(CASHFREE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert resp.status_code == 403, resp.text
    assert _wallet_minutes(db_session, 17) == 0
