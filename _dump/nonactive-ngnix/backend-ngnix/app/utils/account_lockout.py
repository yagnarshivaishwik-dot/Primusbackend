"""
Account lockout utility to prevent brute-force attacks.
"""

import json
import os
from datetime import UTC, datetime

# Configuration
MAX_FAILED_ATTEMPTS = int(os.getenv("MAX_FAILED_LOGIN_ATTEMPTS", "5"))
LOCKOUT_DURATION_MINUTES = int(os.getenv("LOCKOUT_DURATION_MINUTES", "15"))
ATTEMPT_WINDOW_MINUTES = int(os.getenv("ATTEMPT_WINDOW_MINUTES", "15"))


class InMemoryLockoutStore:
    """In-memory store for account lockout (fallback when Redis unavailable)."""

    def __init__(self):
        self._attempts: dict[str, list[float]] = {}  # email -> list of timestamps
        self._locked: dict[str, float] = {}  # email -> lockout expiry timestamp

    def _cleanup_old_attempts(self, email: str, now: float):
        """Remove attempts outside the time window."""
        if email not in self._attempts:
            return
        window_start = now - (ATTEMPT_WINDOW_MINUTES * 60)
        self._attempts[email] = [ts for ts in self._attempts[email] if ts > window_start]
        if not self._attempts[email]:
            del self._attempts[email]

    def record_failed_attempt(self, email: str) -> bool:
        """
        Record a failed login attempt.

        Returns:
            True if account should be locked, False otherwise
        """
        email = email.lower().strip()
        now = datetime.now(UTC).timestamp()

        # Clean up old attempts
        self._cleanup_old_attempts(email, now)

        # Add current attempt
        if email not in self._attempts:
            self._attempts[email] = []
        self._attempts[email].append(now)

        # Check if lockout threshold reached
        if len(self._attempts[email]) >= MAX_FAILED_ATTEMPTS:
            lockout_until = now + (LOCKOUT_DURATION_MINUTES * 60)
            self._locked[email] = lockout_until
            return True

        return False

    def is_locked(self, email: str) -> tuple[bool, float | None]:
        """
        Check if account is locked.

        Returns:
            Tuple of (is_locked, seconds_remaining)
        """
        email = email.lower().strip()
        now = datetime.now(UTC).timestamp()

        # Check lockout status
        if email in self._locked:
            lockout_until = self._locked[email]
            if now < lockout_until:
                seconds_remaining = lockout_until - now
                return True, seconds_remaining
            else:
                # Lockout expired, clean up
                del self._locked[email]
                if email in self._attempts:
                    del self._attempts[email]

        return False, None

    def clear_attempts(self, email: str):
        """Clear failed attempts for successful login."""
        email = email.lower().strip()
        if email in self._attempts:
            del self._attempts[email]
        if email in self._locked:
            del self._locked[email]


# Global in-memory store (fallback)
_lockout_store = InMemoryLockoutStore()


async def get_lockout_store():
    """Get lockout store (Redis if available, otherwise in-memory)."""
    try:
        from app.utils.otp import get_redis

        redis = await get_redis()
        # Check if it's actually Redis (not InMemoryStore)
        if hasattr(redis, "get") and hasattr(redis, "set"):
            return RedisLockoutStore(redis)
    except Exception:
        pass
    return _lockout_store


class RedisLockoutStore:
    """Redis-backed lockout store."""

    def __init__(self, redis):
        self.redis = redis

    def _key_attempts(self, email: str) -> str:
        return f"lockout:attempts:{email.lower().strip()}"

    def _key_locked(self, email: str) -> str:
        return f"lockout:locked:{email.lower().strip()}"

    async def record_failed_attempt(self, email: str) -> bool:
        email = email.lower().strip()
        now = datetime.now(UTC).timestamp()
        key = self._key_attempts(email)

        # Add attempt with expiry
        await self.redis.set(f"{key}:{now}", "1", ex=ATTEMPT_WINDOW_MINUTES * 60)

        # Note: Redis keys() is blocking, but we'll use a simpler approach
        # Store attempts as a list in a single key
        attempts_key = key
        attempts = await self.redis.get(attempts_key)
        if attempts:
            attempts_list = json.loads(attempts)
            # Filter expired attempts
            window_start = now - (ATTEMPT_WINDOW_MINUTES * 60)
            attempts_list = [ts for ts in attempts_list if ts > window_start]
        else:
            attempts_list = []

        attempts_list.append(now)
        await self.redis.set(
            attempts_key, json.dumps(attempts_list), ex=ATTEMPT_WINDOW_MINUTES * 60
        )

        if len(attempts_list) >= MAX_FAILED_ATTEMPTS:
            lockout_until = now + (LOCKOUT_DURATION_MINUTES * 60)
            await self.redis.set(
                self._key_locked(email), str(lockout_until), ex=LOCKOUT_DURATION_MINUTES * 60
            )
            return True

        return False

    async def is_locked(self, email: str) -> tuple[bool, float | None]:
        email = email.lower().strip()
        now = datetime.utcnow().timestamp()

        locked_until_str = await self.redis.get(self._key_locked(email))
        if locked_until_str:
            locked_until = float(locked_until_str)
            if now < locked_until:
                return True, locked_until - now
            else:
                # Expired, clean up
                await self.redis.delete(self._key_locked(email))
                await self.redis.delete(self._key_attempts(email))

        return False, None

    async def clear_attempts(self, email: str):
        email = email.lower().strip()
        await self.redis.delete(self._key_attempts(email))
        await self.redis.delete(self._key_locked(email))


# Synchronous wrapper for sync code
def record_failed_login_attempt(email: str) -> bool:
    """Record failed login attempt (sync wrapper)."""
    return _lockout_store.record_failed_attempt(email)


def is_account_locked(email: str) -> tuple[bool, float | None]:
    """Check if account is locked (sync wrapper)."""
    return _lockout_store.is_locked(email)


def clear_login_attempts(email: str):
    """Clear failed attempts after successful login (sync wrapper)."""
    _lockout_store.clear_attempts(email)
