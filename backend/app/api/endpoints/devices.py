"""
Mobile push-token registry endpoints.

Mounted under the platform's /api/devices prefix by the API router.

All endpoints require authentication. Tokens are scoped to the global
User identity and shared across cafes, because push notifications follow
the user rather than a specific cafe context.

Rate limiting:
    The app-level RateLimitMiddleware / RedisRateLimitMiddleware already
    caps requests per IP globally. We apply a lightweight additional
    per-IP token-bucket here at 10/min on the write endpoints as a
    defense-in-depth measure. Per-user limiting is documented as a
    follow-up below because it would require either a shared Redis
    namespace or modifying the existing middleware (out of scope for
    this file).
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Deque

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.models import DeviceToken, User
from app.schemas.devices import (
    DeviceHeartbeatIn,
    DeviceTokenIn,
    DeviceTokenOut,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ── In-process per-IP rate limiter (supplemental) ───────────────────────────
# Follow-up: for multi-worker deployments this should move to Redis alongside
# the existing RedisRateLimitMiddleware infrastructure so per-user limits can
# be enforced consistently across workers.

_RL_WINDOW_SECS = 60
_RL_IP_LIMIT = 10
_RL_USER_LIMIT = 5

_ip_hits: dict[str, Deque[float]] = defaultdict(deque)
_user_hits: dict[int, Deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    trusted_proxies_str = os.getenv("TRUSTED_PROXIES", "")
    trusted_proxies = {
        ip.strip() for ip in trusted_proxies_str.split(",") if ip.strip()
    }
    client_host = request.client.host if request.client else None
    if client_host and client_host in trusted_proxies:
        xff = request.headers.get("X-Forwarded-For")
        if xff:
            ips = [ip.strip() for ip in xff.split(",")]
            return ips[0] if ips else client_host
    return client_host or "unknown"


def _check_rate(
    ip: str,
    user_id: int,
    *,
    ip_limit: int = _RL_IP_LIMIT,
    user_limit: int = _RL_USER_LIMIT,
) -> None:
    now = time.time()
    cutoff = now - _RL_WINDOW_SECS

    ip_q = _ip_hits[ip]
    while ip_q and ip_q[0] < cutoff:
        ip_q.popleft()
    if len(ip_q) >= ip_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many device requests from this IP",
        )

    user_q = _user_hits[user_id]
    while user_q and user_q[0] < cutoff:
        user_q.popleft()
    if len(user_q) >= user_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many device requests for this user",
        )

    ip_q.append(now)
    user_q.append(now)


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/register", response_model=DeviceTokenOut)
def register_device(
    payload: DeviceTokenIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeviceTokenOut:
    """Register (or upsert) a mobile push token for the current user.

    If the same token already exists under a different user (reinstall /
    device handoff), reassign it to `current_user`.
    """
    _check_rate(_client_ip(request), current_user.id)

    if len(payload.token) > 4096:
        raise HTTPException(status_code=400, detail="Token too long")

    now = datetime.now(UTC)
    existing = (
        db.query(DeviceToken).filter(DeviceToken.token == payload.token).first()
    )
    if existing is not None:
        existing.user_id = current_user.id
        existing.platform = payload.platform
        if payload.app_version is not None:
            existing.app_version = payload.app_version
        if payload.locale is not None:
            existing.locale = payload.locale
        existing.last_seen_at = now
        # Re-activate a previously revoked token on re-register
        existing.revoked_at = None
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return DeviceTokenOut.model_validate(existing)

    device = DeviceToken(
        user_id=current_user.id,
        token=payload.token,
        platform=payload.platform,
        app_version=payload.app_version,
        locale=payload.locale,
        created_at=now,
        last_seen_at=now,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return DeviceTokenOut.model_validate(device)


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
def heartbeat_device(
    payload: DeviceHeartbeatIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Update last_seen_at for a previously registered device token."""
    _check_rate(_client_ip(request), current_user.id)

    if len(payload.token) > 4096:
        raise HTTPException(status_code=400, detail="Token too long")

    device = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.token == payload.token,
            DeviceToken.user_id == current_user.id,
        )
        .first()
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device token not found")

    device.last_seen_at = datetime.now(UTC)
    db.add(device)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{token}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(
    token: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Soft-revoke a device token (called on mobile logout)."""
    _check_rate(_client_ip(request), current_user.id)

    if len(token) > 4096:
        raise HTTPException(status_code=400, detail="Token too long")

    device = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.token == token,
            DeviceToken.user_id == current_user.id,
        )
        .first()
    )
    if device is None:
        raise HTTPException(status_code=404, detail="Device token not found")

    if device.revoked_at is None:
        device.revoked_at = datetime.now(UTC)
        db.add(device)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/mine", response_model=list[DeviceTokenOut])
def list_my_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DeviceTokenOut]:
    """List the current user's registered device tokens (including revoked)."""
    devices = (
        db.query(DeviceToken)
        .filter(DeviceToken.user_id == current_user.id)
        .order_by(DeviceToken.last_seen_at.desc())
        .all()
    )
    return [DeviceTokenOut.model_validate(d) for d in devices]
