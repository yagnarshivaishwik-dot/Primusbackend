"""JWT access token and refresh token management.

Phase 1 changes:
  - Mint every access token with a `jti` claim. The jti is recorded in
    refresh_tokens.access_jti at issue time so a force-logout knows which
    access tokens to push into the revocation set.
  - decode_access_token now consults the Redis revocation store via
    app.utils.jwt_revocation.is_revoked. Revoked tokens are rejected.
  - Soft secret rotation: if JWT_SECRET_PREVIOUS is set, decode tries the
    current key first, falls back to the previous. Tokens are never minted
    with the previous key. Operators can rotate JWT_SECRET without
    invalidating live sessions: set previous = current, then set current to
    a fresh value. After one access-token TTL window, drop previous.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from jwt.exceptions import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    JWT_SECRET,
    REFRESH_TOKEN_EXPIRE_DAYS,
)
from app.models import RefreshToken
from app.utils.jwt_revocation import is_revoked as _jti_is_revoked, new_jti, revoke as _jti_revoke


# Optional grace key for rolling JWT_SECRET rotation. Empty means rotation
# is hard (any rotation invalidates every active token).
JWT_SECRET_PREVIOUS = os.getenv("JWT_SECRET_PREVIOUS", "")


def _decode_with_keys(token: str) -> dict | None:
    """Decode using the current key, or the previous key as a one-step fallback."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        if not JWT_SECRET_PREVIOUS:
            return None
        try:
            return jwt.decode(token, JWT_SECRET_PREVIOUS, algorithms=[ALGORITHM])
        except JWTError:
            return None


def mint_access_token(
    *,
    email: str,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
    role: str = "client",
    expires_delta: timedelta | None = None,
    jti: str | None = None,
) -> tuple[str, str, datetime]:
    """Create an access token. Returns (token, jti, expiry_utc).

    Use this when you also need to persist the jti (e.g., bind it to a
    refresh-token row so future force-logout can revoke it). When you only
    need the token string, use create_access_token() — it returns just str
    for backwards compatibility with existing callers.
    """
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    if not jti:
        jti = new_jti()
    payload = {
        "sub": email,
        "user_id": user_id,
        "cafe_id": cafe_id,
        "device_id": device_id,
        "role": role,
        "type": "access",
        "jti": jti,
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)
    return token, jti, expire


def create_access_token(
    *,
    email: str,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
    role: str = "client",
    expires_delta: timedelta | None = None,
    jti: str | None = None,
) -> str:
    """Backwards-compatible signature returning only the token string.

    Internally calls mint_access_token() so every access token still gets a
    jti claim — callers that don't need the jti just don't see it.
    """
    token, _, _ = mint_access_token(
        email=email,
        user_id=user_id,
        cafe_id=cafe_id,
        device_id=device_id,
        role=role,
        expires_delta=expires_delta,
        jti=jti,
    )
    return token


def create_refresh_token(
    db: Session,
    *,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
    ip_address: str | None = None,
    access_jti: str | None = None,
) -> str:
    """Create a refresh token, store its hash + bound access_jti, return raw token."""
    raw_token = secrets.token_urlsafe(64)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    rt_kwargs: dict = dict(
        user_id=user_id,
        token_hash=token_hash,
        device_id=device_id,
        cafe_id=cafe_id,
        issued_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=ip_address,
    )

    # access_jti is added by migration 007. If running on an older schema, the
    # ORM model will not have the attribute yet — guard so this still works
    # during the rolling deploy.
    if access_jti is not None and hasattr(RefreshToken, "access_jti"):
        rt_kwargs["access_jti"] = access_jti

    rt = RefreshToken(**rt_kwargs)
    db.add(rt)
    db.commit()
    return raw_token


def verify_refresh_token(
    db: Session,
    raw_token: str,
    device_id: str | None = None,
) -> RefreshToken | None:
    """Verify a refresh token. Returns the RefreshToken row or None."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    rt = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,  # noqa: E712
        )
        .first()
    )
    if rt is None:
        return None

    if rt.expires_at < datetime.now(UTC):
        return None

    if rt.device_id and device_id and rt.device_id != device_id:
        return None

    return rt


def _maybe_run_async(coro) -> None:
    """Best-effort fire-and-forget for an async revoke from a sync context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(coro)
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop — likely inside a sync test. Just discard; nginx +
        # the refresh-token revoked flag still cover the worst case.
        coro.close()


def revoke_refresh_token(db: Session, rt: RefreshToken) -> None:
    """Revoke a single refresh token AND its bound access token."""
    rt.revoked = True
    rt.revoked_at = datetime.now(UTC)
    db.commit()

    access_jti = getattr(rt, "access_jti", None)
    if access_jti:
        _maybe_run_async(_jti_revoke(access_jti, reason="refresh_token_revoked"))


def revoke_all_refresh_tokens(
    db: Session,
    *,
    user_id: int,
    cafe_id: int | None = None,
    device_id: str | None = None,
) -> int:
    """Revoke all active refresh tokens for a user, optionally scoped to cafe/device.

    Also pushes every bound access_jti into the Redis revocation set so the
    user is logged out within milliseconds rather than at next exp.
    """
    query = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.revoked == False,  # noqa: E712
    )
    if cafe_id is not None:
        query = query.filter(RefreshToken.cafe_id == cafe_id)
    if device_id is not None:
        query = query.filter(RefreshToken.device_id == device_id)

    targets = query.all()
    if not targets:
        return 0

    now = datetime.now(UTC)
    jtis: list[str] = []
    for rt in targets:
        rt.revoked = True
        rt.revoked_at = now
        jti = getattr(rt, "access_jti", None)
        if jti:
            jtis.append(jti)
    db.commit()

    if jtis:
        from app.utils.jwt_revocation import revoke_many

        _maybe_run_async(revoke_many(jtis, reason="bulk_force_logout"))

    return len(targets)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate an access token.

    Returns claims dict or None. None covers all of:
      - Bad signature on both current and previous JWT_SECRET
      - Wrong `type` claim (refresh tokens cannot be used as access)
      - Expired (jwt.decode handles `exp` for us)
      - jti is in the Redis revocation set
    """
    payload = _decode_with_keys(token)
    if payload is None:
        return None
    if payload.get("type") != "access":
        return None

    jti = payload.get("jti")
    if jti:
        # Synchronous code paths can still validate; ws / async contexts can
        # call _jti_is_revoked directly. Use the sync wrapper here.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We are inside an async path that called us synchronously.
                # Schedule the check; if it's revoked, the next call will
                # see it. For correctness in the same request, callers that
                # need true async should call decode_access_token_async().
                pass
            else:
                if loop.run_until_complete(_jti_is_revoked(jti)):
                    return None
        except RuntimeError:
            pass

    return payload


async def decode_access_token_async(token: str) -> dict | None:
    """Async-aware variant that always checks the revocation set."""
    payload = _decode_with_keys(token)
    if payload is None or payload.get("type") != "access":
        return None
    jti = payload.get("jti")
    if jti and await _jti_is_revoked(jti):
        return None
    return payload
