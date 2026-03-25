"""Tests for account lockout functionality."""

from app.utils.account_lockout import (
    InMemoryLockoutStore,
    clear_login_attempts,
    is_account_locked,
    record_failed_login_attempt,
)


def test_lockout_store_record_failed_attempt():
    """Test recording failed login attempts."""
    store = InMemoryLockoutStore()

    email = "test@example.com"

    # Record attempts up to threshold
    for _i in range(4):
        should_lock = store.record_failed_attempt(email)
        assert should_lock is False

    # 5th attempt should trigger lockout
    should_lock = store.record_failed_attempt(email)
    assert should_lock is True


def test_lockout_store_is_locked():
    """Test checking if account is locked."""
    store = InMemoryLockoutStore()

    email = "test@example.com"

    # Account should not be locked initially
    locked, remaining = store.is_locked(email)
    assert locked is False
    assert remaining is None

    # Lock account
    for _ in range(5):
        store.record_failed_attempt(email)

    # Account should now be locked
    locked, remaining = store.is_locked(email)
    assert locked is True
    assert remaining is not None
    assert remaining > 0


def test_lockout_store_clear_attempts():
    """Test clearing failed attempts."""
    store = InMemoryLockoutStore()

    email = "test@example.com"

    # Record some attempts
    for _ in range(3):
        store.record_failed_attempt(email)

    # Clear attempts
    store.clear_attempts(email)

    # Account should not be locked
    locked, remaining = store.is_locked(email)
    assert locked is False
    assert remaining is None


def test_sync_wrapper_functions():
    """Test sync wrapper functions."""
    email = "test@example.com"

    # Clear any existing attempts
    clear_login_attempts(email)

    # Record failed attempts
    for _i in range(4):
        should_lock = record_failed_login_attempt(email)
        assert should_lock is False

    # 5th attempt should trigger lockout
    should_lock = record_failed_login_attempt(email)
    assert should_lock is True

    # Check if locked
    locked, remaining = is_account_locked(email)
    assert locked is True
    assert remaining is not None

    # Clear attempts
    clear_login_attempts(email)

    # Should not be locked anymore
    locked, remaining = is_account_locked(email)
    assert locked is False
