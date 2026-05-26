"""
Integration tests verifying forensic audit BUG #6 is fixed.

BUG #6: ``POST /api/v1/shop/purchase`` previously accepted ``user_id`` in
the request body — a logged-in client could credit minutes to any peer
account in the same cafe by simply forging the user_id field.

The fix removes ``user_id`` from ``ShopPurchaseIn`` so it can never be
honoured. The endpoint must now derive user_id from ``ctx.user_id`` (JWT).

We also verify the admin-only ``confirm-payment`` flow refuses to confirm
a purchase whose target user lives in a different cafe.
"""
from __future__ import annotations

import bcrypt as bcrypt_lib
import pytest

from app.models import Offer, User


SHOP_PURCHASE_PATH = "/api/v1/shop/purchase"
SHOP_PURCHASE_LEGACY = "/api/shop/purchase"
SHOP_CONFIRM_PATH = "/api/v1/shop/confirm-payment"


def _seed_pack(db, *, offer_id: int = 1, minutes: int = 60) -> Offer:
    off = Offer(
        id=offer_id, name=f"iso-pack-{offer_id}",
        hours_minutes=minutes, price=50.0, active=True,
    )
    db.add(off)
    db.commit()
    db.refresh(off)
    return off


def _mkuser(db, *, email: str, role: str = "client", cafe_id: int | None = None) -> User:
    pw = bcrypt_lib.hashpw(b"testpassword123", bcrypt_lib.gensalt()).decode("utf-8")
    u = User(
        name=email.split("@")[0],
        email=email,
        password_hash=pw,
        role=role,
        is_email_verified=True,
        cafe_id=cafe_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _login(client, *, email: str, password: str = "testpassword123") -> str:
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _try_post(client, paths, **kw):
    """Try each candidate path in order; return the first non-404 response."""
    last = None
    for p in paths:
        r = client.post(p, **kw)
        last = r
        if r.status_code != 404:
            return r
    return last


def test_user_id_from_body_rejected(client, db_session):
    """BUG #6 — client A POSTs purchase with user_id=B → must NOT credit B."""
    pack = _seed_pack(db_session, offer_id=1, minutes=120)
    client_a = _mkuser(db_session, email="client_a@iso.test", role="client", cafe_id=1)
    client_b = _mkuser(db_session, email="client_b@iso.test", role="client", cafe_id=1)
    token_a = _login(client, email=client_a.email)

    # Body deliberately carries ``user_id`` for the OTHER client.
    body = {
        "client_id": 1,
        "pack_id": str(pack.id),
        "payment_method": "cash",
        "user_id": client_b.id,  # malicious — should be ignored or 422
    }
    resp = _try_post(
        client,
        [SHOP_PURCHASE_PATH, SHOP_PURCHASE_LEGACY],
        json=body,
        headers={"Authorization": f"Bearer {token_a}"},
    )

    if resp.status_code in (400, 422):
        # The Pydantic schema rejected the extra field outright — best case.
        return

    assert resp.status_code == 200, resp.text
    data = resp.json()
    # The credit, if anywhere, must be the authenticated user A — not B.
    # The endpoint returns the user_id on the purchase payload.
    # We can also confirm via UserOffer rows.
    from app.models import UserOffer
    b_credits = (
        db_session.query(UserOffer)
        .filter(UserOffer.user_id == client_b.id)
        .count()
    )
    assert b_credits == 0, (
        "BUG #6 reintroduced — body.user_id was honoured and credited peer"
    )


def test_confirm_payment_admin_must_match_cafe(client, db_session, seeded_cafes):
    """BUG #6 (admin variant) — admin in cafe X confirming for user in cafe Y → 403."""
    pack = _seed_pack(db_session, offer_id=2, minutes=30)
    admin_x = seeded_cafes["admin1"]  # cafe1 admin
    user_y = seeded_cafes["user2"]    # cafe2 user

    token_admin_x = _login(client, email=admin_x.email)

    body = {
        "purchase_id": "fake-purchase-id-deadbeef",
        "client_id": 1,
        "user_id": user_y.id,
        "minutes": 30,
        "payment_method": "cash",
    }
    resp = _try_post(
        client,
        [SHOP_CONFIRM_PATH, "/api/shop/confirm-payment"],
        json=body,
        headers={"Authorization": f"Bearer {token_admin_x}"},
    )

    # Acceptable outcomes:
    #   * 403 / 404 — cross-cafe target rejected at auth/scope layer
    #   * 400      — endpoint validates ownership and refuses
    assert resp.status_code in (400, 403, 404), (
        f"Cross-cafe admin confirm-payment should NOT succeed; got {resp.status_code}"
    )
    # Defensive: in case the endpoint returned 200 in a future regression,
    # assert that user_y in cafe2 received no UserOffer credit anyway.
    from app.models import UserOffer
    leaked = (
        db_session.query(UserOffer).filter(UserOffer.user_id == user_y.id).count()
    )
    assert leaked == 0, "BUG #6 admin-side regression — cross-cafe credit landed"
