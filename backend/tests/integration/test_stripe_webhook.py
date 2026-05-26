"""
Integration tests for the Stripe webhook.

Forensic audit BUG #23 — Stripe parity with the hardened Cashfree path:
  * stripe.Webhook.construct_event signature verification
  * Idempotency by Stripe event_id (re-delivery → no-op)
  * Per-event ledger row in wallet_transactions

This file uses a HAND-ROLLED Stripe signature (t=..., v1=...) so we don't
depend on the real ``stripe`` SDK in CI — only the SUT does. When the SDK
is installed in CI, ``construct_event`` consumes the same scheme.

Tests are skipped if the stripe SDK is not importable at all (the SUT
returns 503 in that case, which is correct but uninteresting to test
against repeatedly).
"""
from __future__ import annotations

import os
import time

import pytest

from app.models import Offer, User, UserOffer, WalletTransaction

pytest_plugins = []
try:
    import stripe  # noqa: F401
except ImportError:  # pragma: no cover
    pytest.skip("stripe SDK not installed", allow_module_level=True)


STRIPE_WEBHOOK_PATH = "/api/v1/payment/stripe/webhook"


def _make_user(db, *, user_id: int = 100, email: str = "stripe@test.com") -> User:
    u = User(
        id=user_id,
        name="stripe user",
        email=email,
        password_hash="x",
        role="client",
        is_email_verified=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _make_offer(db, *, offer_id: int = 50, minutes: int = 60, price: float = 30.0) -> Offer:
    off = Offer(
        id=offer_id, name=f"stripe-pack-{offer_id}",
        hours_minutes=minutes, price=price, active=True,
    )
    db.add(off)
    db.commit()
    db.refresh(off)
    return off


def _credited_minutes(db, user_id: int) -> int:
    return sum(
        int(r.minutes_remaining or 0)
        for r in db.query(UserOffer).filter(UserOffer.user_id == user_id).all()
    )


def _ledger_count(db, *, event_id: str) -> int:
    return (
        db.query(WalletTransaction)
        .filter(WalletTransaction.description.like(f"%stripe:{event_id}%"))
        .count()
    )


def test_valid_webhook_credits_wallet(client, db_session, stripe_signed_payload):
    """Forensic audit BUG #23 — valid Stripe signature credits the wallet."""
    user = _make_user(db_session, user_id=101, email="ok@stripe.test")
    offer = _make_offer(db_session, offer_id=51, minutes=90, price=50.0)

    signed = stripe_signed_payload(
        event_id="evt_OK_1",
        client_reference_id="PRIMUS_STRIPE_OK_1",
        amount_total=5000,  # 50 INR -> 5000 cents
        metadata={
            "user_id": str(user.id),
            "cafe_id": "1",
            "pack_id": str(offer.id),
        },
    )

    resp = client.post(STRIPE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body.get("ok") is True
    assert body.get("minutes_credited") == 90
    assert _credited_minutes(db_session, user.id) == 90
    assert _ledger_count(db_session, event_id="evt_OK_1") == 1


def test_invalid_signature(client, db_session, stripe_signed_payload):
    """Forensic audit BUG #23 — tampered Stripe sig → 401, no credit."""
    user = _make_user(db_session, user_id=102, email="bad@stripe.test")
    signed = stripe_signed_payload(
        event_id="evt_BAD_1",
        client_reference_id="PRIMUS_STRIPE_BAD_1",
        amount_total=1000,
        metadata={"user_id": str(user.id), "cafe_id": "1"},
    )
    # Mutilate the signature
    header = signed.headers["stripe-signature"]
    t, v1 = header.split(",")
    bad = f"{t},{v1[:-4]}deadbeef"
    bad_headers = dict(signed.headers)
    bad_headers["stripe-signature"] = bad

    resp = client.post(STRIPE_WEBHOOK_PATH, content=signed.body, headers=bad_headers)

    assert resp.status_code == 401, resp.text
    assert _credited_minutes(db_session, user.id) == 0
    assert _ledger_count(db_session, event_id="evt_BAD_1") == 0


def test_idempotency(client, db_session, stripe_signed_payload):
    """Forensic audit BUG #23 — re-delivery of the same event_id is a no-op."""
    user = _make_user(db_session, user_id=103, email="idem@stripe.test")
    offer = _make_offer(db_session, offer_id=52, minutes=15, price=10.0)

    signed = stripe_signed_payload(
        event_id="evt_IDEM_1",
        client_reference_id="PRIMUS_STRIPE_IDEM_1",
        amount_total=1000,
        metadata={
            "user_id": str(user.id),
            "cafe_id": "1",
            "pack_id": str(offer.id),
        },
    )

    r1 = client.post(STRIPE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)
    r2 = client.post(STRIPE_WEBHOOK_PATH, content=signed.body, headers=signed.headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json().get("idempotent") is True
    assert _credited_minutes(db_session, user.id) == 15
    assert _ledger_count(db_session, event_id="evt_IDEM_1") == 1
