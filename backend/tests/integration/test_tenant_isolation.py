"""
Pytest port of ``test_universal_login.py`` — tenant isolation.

Forensic audit BUG #19 / forensic test §C04: the only tenant-isolation
coverage in this repo was a hand-curl-style script that needed live
credentials. This file gives CI an authoritative pytest version.

Tests:
  * cafe1 admin cannot read cafe2 users
  * X-Cafe-Id header is ignored — JWT wins
  * RLS blocks a raw cross-tenant SQL query (when ROW_LEVEL_SECURITY is on)
"""
from __future__ import annotations

import os
import pytest
from sqlalchemy import text

from app.models import User


ADMIN_USERS_PATHS = (
    "/api/v1/admin/users",
    "/api/admin/users",
)


def _login(client, *, email: str, password: str = "testpassword123") -> str:
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _try_get(client, paths, **kw):
    last = None
    for p in paths:
        r = client.get(p, **kw)
        last = r
        if r.status_code != 404:
            return r
    return last


def test_cafe1_admin_cannot_read_cafe2_data(client, db_session, seeded_cafes):
    """Cafe1 admin listing users must NOT include any cafe2 user."""
    admin1 = seeded_cafes["admin1"]
    user2 = seeded_cafes["user2"]   # the cafe2 user that MUST be hidden

    token = _login(client, email=admin1.email)
    resp = _try_get(
        client,
        ADMIN_USERS_PATHS,
        headers={"Authorization": f"Bearer {token}"},
    )

    # Accept either an explicit list payload or a paginated shape.
    if resp.status_code == 404:
        pytest.skip("admin/users endpoint not present in this build")
    assert resp.status_code in (200, 403), resp.text
    if resp.status_code != 200:
        return  # 403 is also acceptable — admin scope strictness

    payload = resp.json()
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("users") or []
    emails = {u.get("email") for u in items if isinstance(u, dict)}
    assert user2.email not in emails, (
        f"Tenant isolation breach: cafe1 admin sees cafe2 user {user2.email}"
    )


def test_x_cafe_id_header_does_not_override_jwt(client, db_session, seeded_cafes):
    """Passing X-Cafe-Id for a different cafe must be ignored."""
    admin1 = seeded_cafes["admin1"]
    cafe2_id = seeded_cafes["cafe2"].id
    user2 = seeded_cafes["user2"]

    token = _login(client, email=admin1.email)
    resp = _try_get(
        client,
        ADMIN_USERS_PATHS,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Cafe-Id": str(cafe2_id),
        },
    )

    if resp.status_code == 404:
        pytest.skip("admin/users endpoint not present in this build")
    if resp.status_code == 403:
        return  # auth-layer refused — also acceptable

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("users") or []
    emails = {u.get("email") for u in items if isinstance(u, dict)}
    assert user2.email not in emails, (
        "Tenant breach: X-Cafe-Id header overrode JWT-derived cafe scope"
    )


@pytest.mark.skipif(
    os.environ.get("ROW_LEVEL_SECURITY_ENABLED", "false").lower() != "true",
    reason="RLS not enabled in this test environment",
)
def test_rls_blocks_direct_query_attempt(db_session, seeded_cafes):
    """Direct SQL query for another cafe's wallet_transactions returns 0 rows."""
    cafe1_id = seeded_cafes["cafe1"].id
    cafe2_id = seeded_cafes["cafe2"].id

    # Simulate a session that has been set to "current user belongs to cafe1".
    # The RLS policy is keyed on the ``app.current_cafe_id`` GUC the FastAPI
    # request dependency sets per-request.
    db_session.execute(text(f"SET app.current_cafe_id = '{cafe1_id}'"))

    # Insert a wallet_transactions row for the OTHER cafe — done as an
    # admin/maintenance write that bypasses the GUC (mimicking how the
    # row got there originally).
    db_session.execute(
        text(
            "INSERT INTO wallet_transactions (user_id, cafe_id, amount, type, description) "
            "VALUES (:uid, :cid, 1, 'topup', 'rls-test')"
        ),
        {"uid": seeded_cafes["user2"].id, "cid": cafe2_id},
    )
    db_session.commit()

    rows = db_session.execute(
        text(
            "SELECT id FROM wallet_transactions "
            "WHERE description = 'rls-test'"
        )
    ).fetchall()
    assert rows == [], (
        f"RLS breach: cafe1-scoped session sees {len(rows)} cafe2 rows"
    )
