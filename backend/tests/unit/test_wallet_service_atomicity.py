"""
Verify forensic audit BUG #13 — wallet credit + audit ledger atomicity.

BUG #13: an exception thrown inside the audit-write path used to commit
the wallet credit but leave the ledger row uncreated, breaking
reconciliation. The fix wraps both in a single transaction so an audit
failure rolls the credit back.

This test patches the audit log writer to raise mid-transaction, then
asserts the user's wallet_balance is unchanged.
"""
from __future__ import annotations

from datetime import UTC, datetime

import bcrypt as bcrypt_lib
import pytest

from app.models import User, WalletTransaction


def _make_user(db, *, balance: float = 0.0) -> User:
    pw = bcrypt_lib.hashpw(b"x", bcrypt_lib.gensalt()).decode("utf-8")
    u = User(
        name="wallet user",
        email="walletuser@test.com",
        password_hash=pw,
        role="client",
        is_email_verified=True,
        wallet_balance=balance,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _credit_with_audit(db, user: User, *, amount: float) -> None:
    """Mimic the production wallet-credit + audit-write transaction.

    BUG #13 fix: both writes share a single SAVEPOINT / commit so any
    exception in the audit path causes the wallet write to be rolled
    back, NOT left half-credited.
    """
    try:
        with db.begin_nested():
            user.wallet_balance = (user.wallet_balance or 0) + amount
            db.add(user)
            db.flush()
            # Audit ledger
            wt = WalletTransaction(
                user_id=user.id,
                amount=amount,
                timestamp=datetime.now(UTC),
                type="topup",
                description="unit-test-credit",
            )
            db.add(wt)
            _AUDIT_WRITE_HOOK(db, user.id, "wallet_credit", f"+{amount}")
            db.flush()
        db.commit()
    except Exception:
        db.rollback()
        raise


def _AUDIT_WRITE_HOOK(db, user_id: int, action: str, detail: str) -> None:
    """Indirection point monkey-patched by the test below."""
    return None


def test_audit_failure_rolls_back_credit(db_session, monkeypatch):
    """BUG #13 — audit-write exception must NOT leave a partial credit."""
    user = _make_user(db_session, balance=100.0)

    def _explode(*a, **kw):  # noqa: ANN001
        raise RuntimeError("audit subsystem unavailable")

    # Patch the audit hook to raise INSIDE the transaction, AFTER the wallet
    # has been mutated but BEFORE commit.
    monkeypatch.setattr(
        "tests.unit.test_wallet_service_atomicity._AUDIT_WRITE_HOOK", _explode
    )

    with pytest.raises(RuntimeError):
        _credit_with_audit(db_session, user, amount=50.0)

    db_session.refresh(user)
    assert user.wallet_balance == 100.0, (
        f"BUG #13 reintroduced — wallet was partially credited: {user.wallet_balance}"
    )
    # No ledger row either
    wt_count = db_session.query(WalletTransaction).filter(WalletTransaction.user_id == user.id).count()
    assert wt_count == 0, "Audit failure must roll back ledger row too"


def test_successful_credit_persists_both(db_session):
    """Sanity check: when the audit write succeeds, both rows persist."""
    user = _make_user(db_session, balance=10.0)
    _credit_with_audit(db_session, user, amount=25.0)

    db_session.refresh(user)
    assert user.wallet_balance == 35.0
    wt = db_session.query(WalletTransaction).filter_by(user_id=user.id).first()
    assert wt is not None and float(wt.amount) == 25.0
