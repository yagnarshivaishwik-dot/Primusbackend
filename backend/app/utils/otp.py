import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

from app.config import APP_SECRET
from app.utils.cache import get_redis as get_shared_redis

from .auth import send_email

OTP_TTL_SEC = int(os.getenv("OTP_TTL_SEC", "300"))
RESEND_COOLDOWN_SEC = int(os.getenv("RESEND_COOLDOWN_SEC", "30"))
MAX_SENDS_PER_HOUR = int(os.getenv("MAX_SENDS_PER_HOUR", "5"))
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "5"))
EMAIL_DEV_ECHO = False  # disabled in Firebase-only mode


def _otp_key(email: str) -> str:
    return f"otp:{email.strip().lower()}"


def _verified_key(email: str) -> str:
    return f"otp_verified:{email.strip().lower()}"


def _now_ts() -> int:
    return int(time.time())


def _hash_code(code: str) -> str:
    return hmac.new(APP_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


def _gen_code() -> str:
    return f"{secrets.randbelow(10**6):06d}"


async def get_redis() -> Any:
    """
    Backwards-compatible helper for OTP code that uses the shared Redis cache client.

    If Redis is unavailable, this returns a lightweight in-memory stand-in that mimics
    the subset of Redis methods used here (get/set/delete) so OTP flows still work
    without introducing hard failures.
    """

    shared = await get_shared_redis()
    if shared is not None:
        return shared

    class _InMemoryStore:
        def __init__(self) -> None:
            self._store: dict[str, tuple[dict, int]] = {}

        async def get(self, key: str) -> str | None:
            now = _now_ts()
            item = self._store.get(key)
            if not item:
                return None
            data, exp = item
            if exp and now > exp:
                try:
                    del self._store[key]
                except Exception:
                    pass
                return None
            return json.dumps(data)

        async def set(self, key: str, value: str, ex: int) -> None:
            data = json.loads(value)
            self._store[key] = (data, _now_ts() + ex)

        async def delete(self, key: str) -> None:
            try:
                del self._store[key]
            except Exception:
                pass

    return _InMemoryStore()


async def request_otp(email: str, recipient_name: str | None = None) -> str | None:
    email = email.strip().lower()
    r = await get_redis()
    key = _otp_key(email)
    now = _now_ts()

    existing = await r.get(key)
    data = json.loads(existing) if existing else None

    if data and now - data.get("last_sent", 0) < RESEND_COOLDOWN_SEC:
        raise ValueError("Please wait before requesting another code.")

    window_start = data.get("window_start", now) if data else now
    send_count = data.get("send_count", 0) if data else 0
    if now - window_start >= 3600:
        window_start, send_count = now, 0
    if send_count >= MAX_SENDS_PER_HOUR:
        raise ValueError("Too many codes requested. Try later.")

    code = _gen_code()
    payload = {
        "code_hash": _hash_code(code),
        "expires": now + OTP_TTL_SEC,
        "attempts": 0,
        "send_count": send_count + 1,
        "window_start": window_start,
        "last_sent": now,
    }
    await r.set(key, json.dumps(payload), ex=OTP_TTL_SEC + 300)

    name = recipient_name or email.split("@")[0]
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your verification code is:</p>"
        f'<p style="font-size:22px; font-weight:700; letter-spacing:2px;">{code}</p>'
        f"<p>This code expires in {OTP_TTL_SEC // 60} minutes.</p>"
    )
    send_email(email, "Your verification code", html)
    return code if EMAIL_DEV_ECHO else None


async def verify_otp(email: str, code: str) -> bool:
    email = email.strip().lower()
    code = code.strip()
    if not (code.isdigit() and len(code) == 6):
        raise ValueError("Invalid code format")
    r = await get_redis()
    key = _otp_key(email)
    existing = await r.get(key)
    if not existing:
        raise ValueError("Code expired or not requested")
    data = json.loads(existing)
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
    # success: consume OTP and mark verified for a short window
    await r.delete(key)
    await r.set(_verified_key(email), "1", ex=600)  # 10 minutes to complete registration
    return True


async def is_email_verified_window(email: str) -> bool:
    r = await get_redis()
    v = await r.get(_verified_key(email))
    return bool(v == "1")
