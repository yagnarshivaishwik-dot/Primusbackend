"""
Verify forensic audit BUG #4 — internal-auth account lockout enforcement.

BUG #4: ``/api/internal/auth/login`` had no brute-force protection. The
fix wired MAX_FAILED_LOGIN_ATTEMPTS / LOCKOUT_DURATION_MINUTES through
``app.utils.account_lockout``.

This test exercises the public surface end-to-end with the in-memory
lockout store the test conftest already wires.
"""
from __future__ import annotations

import bcrypt as bcrypt_lib
import pytest

from app.models import User
from app.utils.account_lockout import (
    _lockout_store,
    is_account_locked,
)


INTERNAL_LOGIN_PATH = "/api/internal/auth/login"
MAX_ATTEMPTS = 5
LOCKOUT_STATUS = 423


@pytest.fixture
def superadmin_user(db_session) -> User:
    pw = bcrypt_lib.hashpw(b"superadminpassword123", bcrypt_lib.gensalt()).decode("utf-8")
    u = User(
        name="Super Admin",
        email="superadmin@primustech.in",
        password_hash=pw,
        role="superadmin",
        is_email_verified=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def test_lockout_after_five_failures(client, db_session, superadmin_user):
    """5 wrong passwords in a row → 6th request returns 423 (locked)."""
    _lockout_store._attempts.clear()
    _lockout_store._locked.clear()

    for attempt in range(MAX_ATTEMPTS):
        resp = client.post(
            INTERNAL_LOGIN_PATH,
            json={"username": superadmin_user.email, "password": "wrong-password"},
        )
        # Each individual failure returns 401 until the threshold trips.
        assert resp.status_code in (401, LOCKOUT_STATUS), (
            f"Attempt {attempt + 1} should be 401, got {resp.status_code}"
        )

    locked, remaining = is_account_locked(superadmin_user.email)
    assert locked is True, "Account must be locked after MAX_FAILED_LOGIN_ATTEMPTS"
    assert remaining is not None and remaining > 0

    # Even with the correct password, the endpoint must refuse while locked.
    resp = client.post(
        INTERNAL_LOGIN_PATH,
        json={"username": superadmin_user.email, "password": "superadminpassword123"},
    )
    assert resp.status_code == LOCKOUT_STATUS, (
        f"Locked account must reject correct credentials too; got {resp.status_code}"
    )


def test_successful_login_resets_counter(client, db_session, superadmin_user):
    """A successful login between failed attempts resets the counter."""
    _lockout_store._attempts.clear()
    _lockout_store._locked.clear()

    # 3 failures
    for _ in range(3):
        r = client.post(
            INTERNAL_LOGIN_PATH,
            json={"username": superadmin_user.email, "password": "wrong"},
        )
        assert r.status_code == 401

    # 1 successful login — counter must reset.
    r = client.post(
        INTERNAL_LOGIN_PATH,
        json={"username": superadmin_user.email, "password": "superadminpassword123"},
    )
    assert r.status_code == 200, r.text

    locked, _ = is_account_locked(superadmin_user.email)
    assert locked is False
    assert _lockout_store._attempts.get(superadmin_user.email.lower(), []) == []

    # Now 4 more failures should not lock — counter restarted at 0.
    for _ in range(4):
        r = client.post(
            INTERNAL_LOGIN_PATH,
            json={"username": superadmin_user.email, "password": "wrong"},
        )
        assert r.status_code == 401

    locked2, _ = is_account_locked(superadmin_user.email)
    assert locked2 is False, "Counter should have reset on prior success"
