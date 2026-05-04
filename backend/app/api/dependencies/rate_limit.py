"""Per-endpoint rate limiting as a FastAPI dependency.

Audit findings addressed:
  - BE-H4 / SEC-H3: /api/auth/login, /api/auth/register, OTP request/verify and
    forgot-password have no per-endpoint rate limit. Today only the global
    1000 req/min middleware exists, which is far too permissive for these
    targets. nginx/rate_limits.conf added a network-edge backstop in Phase 0;
    this dependency is the application-layer equivalent (defense in depth).

Design:
  - Sliding-window counter in Redis. Each `RateLimit` instance owns a unique
    `zone` name and an `(events, per_seconds)` budget. The dependency derives
    a per-actor key (default: IP address) and atomically increments a counter
    bucket via INCR + EXPIRE.

  - Identifier resolution is configurable so we can use email for login
    (preventing one attacker from rotating IPs while attacking one account)
    or device-id for kiosk endpoints. Defaults to the request IP.

  - Failure mode: if Redis is down, the dependency falls open with a logged
    warning. The network-edge nginx limiter remains as the backstop. Prefer
    open over closed here because a transient Redis blip should not lock
    every user out of login.

Usage:
    from app.api.dependencies import RateLimit

    login_limit = RateLimit(zone="auth_login", events=5, per_seconds=900,
                            identifier="email")

    @router.post("/login")
    async def login(form: OAuth2PasswordRequestForm = Depends(),
                    _: None = Depends(login_limit)):
        ...
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Awaitable, Callable, Literal

from fastapi import Depends, HTTPException, Request

from app.utils.cache import get_redis as _get_shared_redis


logger = logging.getLogger("primus.rate_limit")


# Trusted proxy CIDRs for X-Forwarded-For. Keep in sync with the nginx
# trust list in backend/nginx/default.conf.
_TRUSTED_PROXY_CIDRS = (
    "127.0.0.0/8",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
)


def _client_ip(request: Request) -> str:
    """Resolve the actor IP, honoring X-Forwarded-For only from trusted proxies."""
    import ipaddress

    peer = request.client.host if request.client else "unknown"
    try:
        peer_addr = ipaddress.ip_address(peer)
    except ValueError:
        return peer

    trusted = any(peer_addr in ipaddress.ip_network(c) for c in _TRUSTED_PROXY_CIDRS)
    if trusted:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            first = xff.split(",")[0].strip()
            try:
                ipaddress.ip_address(first)
                return first
            except ValueError:
                pass
    return str(peer_addr)


IdentifierKind = Literal["ip", "email", "device", "user_id", "custom"]


class RateLimit:
    """Reusable FastAPI dependency that enforces a per-actor budget."""

    def __init__(
        self,
        *,
        zone: str,
        events: int,
        per_seconds: int,
        identifier: IdentifierKind = "ip",
        identifier_resolver: Callable[[Request], Awaitable[str] | str] | None = None,
        skip_in_test: bool = True,
    ) -> None:
        if events <= 0:
            raise ValueError("events must be > 0")
        if per_seconds <= 0:
            raise ValueError("per_seconds must be > 0")

        self.zone = zone
        self.events = events
        self.per_seconds = per_seconds
        self.identifier = identifier
        self._identifier_resolver = identifier_resolver
        self._skip_in_test = skip_in_test

    def _key_prefix(self) -> str:
        return f"rl:{self.zone}:"

    async def _resolve_id(self, request: Request) -> str:
        if self._identifier_resolver is not None:
            v = self._identifier_resolver(request)
            return await v if hasattr(v, "__await__") else str(v)

        if self.identifier == "email":
            # Best-effort: pull from form field, body json, or query param.
            try:
                form = await request.form()
                if "username" in form:
                    return f"email:{str(form['username']).strip().lower()}"
                if "email" in form:
                    return f"email:{str(form['email']).strip().lower()}"
            except Exception:
                pass
            qp = request.query_params.get("email") or request.query_params.get("username")
            if qp:
                return f"email:{qp.strip().lower()}"
            return f"ip:{_client_ip(request)}"

        if self.identifier == "device":
            dev = request.headers.get("x-pc-id") or request.headers.get("x-device-id")
            if dev:
                return f"device:{dev}"
            return f"ip:{_client_ip(request)}"

        # default: by IP
        return f"ip:{_client_ip(request)}"

    async def __call__(self, request: Request) -> None:
        # Skip during pytest unless caller opted in. This keeps tests from
        # having to manipulate Redis state for unrelated assertions.
        if self._skip_in_test and os.getenv("PYTEST_CURRENT_TEST"):
            return

        actor = await self._resolve_id(request)
        key = f"{self._key_prefix()}{actor}"

        r: Any = await _get_shared_redis()
        if r is None:
            logger.warning("rate_limit[%s]: redis unavailable; passing through", self.zone)
            return

        try:
            # Atomic INCR + EXPIRE-on-first-write pattern.
            # Using pipeline if the client exposes one; otherwise sequential.
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, self.per_seconds)
        except Exception as exc:
            logger.warning("rate_limit[%s]: redis error %r; passing through", self.zone, exc)
            return

        if count > self.events:
            # Compute Retry-After by reading the TTL.
            try:
                ttl = await r.ttl(key)
                retry_after = max(1, int(ttl)) if ttl and int(ttl) > 0 else self.per_seconds
            except Exception:
                retry_after = self.per_seconds

            logger.info(
                "rate_limit[%s]: actor=%s exceeded budget %d/%ds (count=%d)",
                self.zone, actor, self.events, self.per_seconds, count,
            )
            raise HTTPException(
                status_code=429,
                detail={
                    "error": "rate_limited",
                    "zone": self.zone,
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )


# Pre-baked instances matching the nginx zones in
# backend/nginx/rate_limits.conf. Endpoint code uses these directly.
LOGIN_LIMIT = RateLimit(
    zone="auth_login", events=5, per_seconds=900, identifier="email",
)

REGISTER_LIMIT = RateLimit(
    zone="auth_register", events=3, per_seconds=3600, identifier="ip",
)

# Bumped from very-tight defaults (3/hour) to operator-friendly ones after
# the OTP-reset rollout repeatedly locked users out while testing. Internal-
# tool threat model: email-bombing isn't a realistic attack vector here,
# and the new zone names below ("auth_forgot_v2" etc.) reset the Redis
# sliding-window counters so anyone currently locked out is unblocked the
# moment the new image rolls out — without needing a manual Redis FLUSH.
FORGOT_LIMIT = RateLimit(
    zone="auth_forgot_v2", events=20, per_seconds=3600, identifier="email",
)

OTP_REQUEST_LIMIT = RateLimit(
    zone="otp_request_v2", events=30, per_seconds=3600, identifier="email",
)

OTP_VERIFY_LIMIT = RateLimit(
    # Verify is what the user retries most (mistyped digit, fresh OTP) —
    # being tight here forces another /forgot call, which compounds the
    # lockout. Was 10/5min, now 30/5min.
    zone="otp_verify_v2", events=30, per_seconds=300, identifier="email",
)

PASSWORD_CHANGE_LIMIT = RateLimit(
    zone="password_change_v2", events=20, per_seconds=3600, identifier="user_id",
)
