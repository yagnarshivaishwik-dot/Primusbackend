"""Phase 1: hardened OTP module.

Audit findings addressed:
  - SEC-C6 / H1: 6-digit decimal OTP yields ~1M code space, brute-forceable
    in minutes at 3 guesses/sec. Replaced with 8-char Crockford base32
    (~2.8e12 codes, 41 bits of entropy). Backed by Redis with TTL, single-use,
    per-email rate counters.
  - The legacy app/utils/otp.py used a "Redis if available, else in-memory
    dict" fallback. The dict path was a footgun in any multi-replica deploy.
    This module fails CLOSED if Redis is unavailable in production.

Format:
  Crockford base32 alphabet  0123456789ABCDEFGHJKMNPQRSTVWXYZ
  - Excludes I, L, O, U to reduce visual ambiguity.
  - 8 chars × 32 alphabet = 32^8 ≈ 1.1e12 codes.
  - User-friendly grouped display: "ABCD-EFGH" (caller may format).

Lifecycle:
  - request_otp(email, recipient_name=None)
        Generates a code, stores its hash + metadata in Redis with OTP_TTL_SEC,
        sends the email. Enforces RESEND_COOLDOWN_SEC and MAX_SENDS_PER_HOUR
        per-email. Returns the code only when the dev echo flag is on.

  - verify_otp(email, code)
        Constant-time comparison against the stored hash. Increments an
        attempts counter; once MAX_ATTEMPTS is reached the entry is deleted
        (next request_otp issues a fresh one). On success the entry is
        deleted (single-use) and a short verified-window flag is set so a
        downstream registration step can use it.

  - is_email_verified_window(email)
        Returns True if the user verified an OTP within the last
        VERIFIED_WINDOW_SEC (default 600).

The functional surface intentionally mirrors app.utils.otp so callers can
swap module imports with a one-line change. Both modules will coexist for one
release; Phase 2 will retire the legacy module.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from typing import Any

from app.config import APP_SECRET, IS_PRODUCTION


logger = logging.getLogger("primus.otp_v2")


# Crockford base32 alphabet (no I, L, O, U).
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

CODE_LENGTH = int(os.getenv("OTP_CODE_LENGTH", "8"))
OTP_TTL_SEC = int(os.getenv("OTP_TTL_SEC", "300"))
RESEND_COOLDOWN_SEC = int(os.getenv("OTP_RESEND_COOLDOWN_SEC", "30"))
MAX_SENDS_PER_HOUR = int(os.getenv("OTP_MAX_SENDS_PER_HOUR", "5"))
MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
VERIFIED_WINDOW_SEC = int(os.getenv("OTP_VERIFIED_WINDOW_SEC", "600"))
DEV_ECHO = (
    not IS_PRODUCTION
    and os.getenv("OTP_DEV_ECHO", "false").strip().lower() in ("1", "true", "yes")
)


def _otp_key(email: str) -> str:
    return f"otp2:code:{email.strip().lower()}"


def _verified_key(email: str) -> str:
    return f"otp2:verified:{email.strip().lower()}"


def _now_ts() -> int:
    return int(time.time())


def _hash_code(code: str) -> str:
    """HMAC-SHA256 of the code under APP_SECRET. Stored, never the plaintext."""
    return hmac.new(APP_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


def gen_code() -> str:
    """Generate a uniformly-random Crockford base32 code of CODE_LENGTH chars."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(CODE_LENGTH))


def normalize(user_input: str) -> str:
    """Normalize user-typed codes so common typos still match.

    - Strips whitespace and the visual separator `-`.
    - Uppercases.
    - Substitutes the visually-ambiguous letters that Crockford excludes:
        I -> 1, L -> 1, O -> 0, U -> V
    - Rejects any character outside the alphabet by raising ValueError.
    """
    cleaned = "".join(c for c in user_input.upper() if not c.isspace() and c != "-")
    sub_map = {"I": "1", "L": "1", "O": "0", "U": "V"}
    cleaned = "".join(sub_map.get(c, c) for c in cleaned)
    if len(cleaned) != CODE_LENGTH:
        raise ValueError("Invalid code format")
    if any(c not in _ALPHABET for c in cleaned):
        raise ValueError("Invalid code format")
    return cleaned


async def _redis() -> Any:
    """Return the shared Redis client, or None if unavailable."""
    from app.utils.cache import get_redis as _get_shared_redis

    return await _get_shared_redis()


async def _redis_required() -> Any:
    """Return the shared Redis client; in production fail closed if unavailable.

    Production OTP MUST be persistent and shared across replicas. A single
    in-process dict cannot satisfy that. Outside production we still fall
    through with a no-op marker so local dev does not break.
    """
    r = await _redis()
    if r is not None:
        return r
    if IS_PRODUCTION:
        logger.error("otp_v2: Redis unavailable; refusing to issue OTP in production")
        raise RuntimeError("OTP backing store unavailable")
    logger.warning("otp_v2: Redis unavailable; running in in-memory dev fallback")
    return _DevInMemoryRedis()


# --- request --------------------------------------------------------------

async def request_otp(
    email: str,
    *,
    recipient_name: str | None = None,
) -> str | None:
    """Issue a fresh OTP and email it.

    Returns the plaintext code only when DEV_ECHO is enabled (development
    only, never in production).

    Raises ValueError on cooldown / too-many-sends.
    """
    email = email.strip().lower()
    r = await _redis_required()
    key = _otp_key(email)
    now = _now_ts()

    raw = await r.get(key)
    data = json.loads(raw) if raw else None

    if data and now - data.get("last_sent", 0) < RESEND_COOLDOWN_SEC:
        raise ValueError("Please wait before requesting another code.")

    window_start = data.get("window_start", now) if data else now
    send_count = data.get("send_count", 0) if data else 0
    if now - window_start >= 3600:
        window_start, send_count = now, 0
    if send_count >= MAX_SENDS_PER_HOUR:
        raise ValueError("Too many codes requested. Try later.")

    code = gen_code()
    payload = {
        "code_hash": _hash_code(code),
        "expires": now + OTP_TTL_SEC,
        "attempts": 0,
        "send_count": send_count + 1,
        "window_start": window_start,
        "last_sent": now,
        "issued_at": now,
        "version": 2,
    }
    # TTL = code lifetime + a margin so we still see attempts counter after
    # the code itself is invalid.
    await r.set(key, json.dumps(payload), ex=OTP_TTL_SEC + 300)

    _send_otp_email(email, code, recipient_name)

    return code if DEV_ECHO else None


def _send_otp_email(email: str, code: str, recipient_name: str | None) -> None:
    """Format and dispatch the OTP email.

    Pulled out of request_otp so tests can monkey-patch it without faking
    the Redis store. Reuses the existing app.api.endpoints.auth.send_email
    helper for consistency with the rest of the app's mailer.
    """
    from app.api.endpoints.auth import send_email as _send_email

    name = recipient_name or email.split("@")[0]
    pretty = f"{code[:4]}-{code[4:]}" if len(code) >= 8 else code
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your verification code is:</p>"
        f'<p style="font-family:monospace;font-size:22px;font-weight:700;'
        f'letter-spacing:3px;">{pretty}</p>'
        f"<p>This code expires in {OTP_TTL_SEC // 60} minutes. It can be "
        f"used once. If you did not request it, you can safely ignore this "
        f"email.</p>"
    )
    _send_email(email, "Your verification code", html)


# --- verify ---------------------------------------------------------------

async def verify_otp(email: str, code: str) -> bool:
    """Verify a user-supplied code against the stored hash.

    Constant-time. Single-use. Increments attempts on miss; clears on hit
    or attempt-cap-exceeded.
    """
    email = email.strip().lower()
    code = normalize(code)

    r = await _redis_required()
    key = _otp_key(email)

    raw = await r.get(key)
    if not raw:
        raise ValueError("Code expired or not requested")

    data = json.loads(raw)
    now = _now_ts()
    if now > data["expires"]:
        await r.delete(key)
        raise ValueError("Code has expired")
    if data["attempts"] >= MAX_ATTEMPTS:
        await r.delete(key)
        raise ValueError("Too many attempts")

    ok = hmac.compare_digest(data["code_hash"], _hash_code(code))
    if not ok:
        data["attempts"] += 1
        await r.set(key, json.dumps(data), ex=max(1, data["expires"] - now))
        raise ValueError("Incorrect code")

    # Success — single-use. Delete the code, set a short verified-window
    # flag so the downstream registration / verify-email step can read it.
    await r.delete(key)
    await r.set(_verified_key(email), "1", ex=VERIFIED_WINDOW_SEC)
    return True


async def is_email_verified_window(email: str) -> bool:
    r = await _redis()
    if r is None:
        return False
    v = await r.get(_verified_key(email))
    return bool(v == "1" or v == b"1")


# --- dev fallback ---------------------------------------------------------

class _DevInMemoryRedis:
    """Minimal in-process Redis stand-in for local dev only.

    Intentionally NOT a faithful Redis emulation. Only covers the methods
    this module uses. Single-process: any multi-replica deploy will race.
    Production must use real Redis.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, int]] = {}

    async def get(self, key: str) -> str | None:
        item = self._store.get(key)
        if not item:
            return None
        value, exp = item
        if exp and _now_ts() > exp:
            self._store.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: str, ex: int = 0) -> None:
        self._store[key] = (value, _now_ts() + ex if ex else 0)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
