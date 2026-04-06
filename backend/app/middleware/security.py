"""
Security middleware for FastAPI application.
Includes security headers, distributed rate limiting, and request size limits.
"""

import logging
import os
import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("primus.middleware.security")

# Paths exempt from rate limiting
_RATE_LIMIT_EXEMPT_PATHS = frozenset({"/health", "/", "/api/health", "/metrics"})


def _get_client_id(request: Request) -> str:
    """
    Get client identifier for rate limiting.

    SECURITY: Only trust X-Forwarded-For from configured trusted proxies.
    """
    trusted_proxies_str = os.getenv("TRUSTED_PROXIES", "")
    trusted_proxies = set(ip.strip() for ip in trusted_proxies_str.split(",") if ip.strip())

    client_host = request.client.host if request.client else None

    if client_host and client_host in trusted_proxies:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            ips = [ip.strip() for ip in forwarded_for.split(",")]
            return ips[0] if ips else client_host

    return client_host or "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        if request.url.scheme == "https":
            max_age = int(os.getenv("HSTS_MAX_AGE", "63072000"))
            response.headers["Strict-Transport-Security"] = (
                f"max-age={max_age}; includeSubDomains; preload"
            )

        csp = os.getenv(
            "CONTENT_SECURITY_POLICY",
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data: https:; font-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
            "form-action 'self'",
        )
        response.headers["Content-Security-Policy"] = csp

        return response


# ── In-Memory Rate Limiter (fallback) ────────────────────────────────


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory rate limiting — used as fallback when Redis is unavailable."""

    def __init__(self, app, requests_per_minute: int = 60, burst: int = 10):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst = burst
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._cleanup_interval = 300
        self._last_cleanup = time.time()

    def _cleanup_old_entries(self):
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        cutoff = now - 60
        for key in list(self._requests.keys()):
            self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]
            if not self._requests[key]:
                del self._requests[key]
        self._last_cleanup = now

    def _is_rate_limited(self, client_id: str) -> tuple[bool, int]:
        now = time.time()
        window_start = now - 60

        self._cleanup_old_entries()

        requests = self._requests[client_id]
        requests = [ts for ts in requests if ts > window_start]
        self._requests[client_id] = requests

        if len(requests) >= self.requests_per_minute:
            oldest_request = min(requests) if requests else now
            retry_after = int(60 - (now - oldest_request)) + 1
            return True, max(retry_after, 1)

        requests.append(now)
        self._requests[client_id] = requests
        return False, 0

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _RATE_LIMIT_EXEMPT_PATHS:
            return await call_next(request)

        client_id = _get_client_id(request)
        is_limited, retry_after = self._is_rate_limited(client_id)

        if is_limited:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Retry in {retry_after}s."},
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)


# ── Redis-Backed Distributed Rate Limiter ────────────────────────────


class RedisRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Distributed rate limiting using Redis INCR + EXPIRE.

    Falls back to in-memory RateLimitMiddleware if Redis is unavailable
    (fail-open: allows requests rather than blocking on Redis errors).
    """

    def __init__(
        self,
        app,
        requests_per_minute: int = 60,
        burst: int = 10,
        redis_url: str | None = None,
    ):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst = burst
        self._redis_url = redis_url or os.getenv("REDIS_URL", "")
        self._redis = None
        self._redis_checked = False
        # Fallback: construct an in-memory limiter (but don't re-wrap app)
        self._fallback_requests: dict[str, list[float]] = defaultdict(list)
        self._fallback_cleanup_interval = 300
        self._fallback_last_cleanup = time.time()

    async def _get_redis(self):
        """Lazy-init Redis connection. Returns None if unavailable."""
        if self._redis is not None:
            return self._redis
        if self._redis_checked:
            return None  # Already failed, don't retry every request

        if not self._redis_url:
            self._redis_checked = True
            return None

        try:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await self._redis.ping()
            logger.info("Redis rate limiter connected")
            return self._redis
        except Exception:
            logger.warning("Redis unavailable for rate limiting — using in-memory fallback")
            self._redis = None
            self._redis_checked = True
            return None

    def _fallback_check(self, client_id: str) -> tuple[bool, int]:
        """In-memory fallback rate check."""
        now = time.time()
        window_start = now - 60

        if now - self._fallback_last_cleanup > self._fallback_cleanup_interval:
            cutoff = now - 60
            for key in list(self._fallback_requests.keys()):
                self._fallback_requests[key] = [
                    ts for ts in self._fallback_requests[key] if ts > cutoff
                ]
                if not self._fallback_requests[key]:
                    del self._fallback_requests[key]
            self._fallback_last_cleanup = now

        reqs = self._fallback_requests[client_id]
        reqs = [ts for ts in reqs if ts > window_start]
        self._fallback_requests[client_id] = reqs

        if len(reqs) >= self.requests_per_minute:
            oldest = min(reqs) if reqs else now
            retry_after = int(60 - (now - oldest)) + 1
            return True, max(retry_after, 1)

        reqs.append(now)
        self._fallback_requests[client_id] = reqs
        return False, 0

    async def dispatch(self, request: Request, call_next):
        if request.url.path in _RATE_LIMIT_EXEMPT_PATHS:
            return await call_next(request)

        client_id = _get_client_id(request)

        r = await self._get_redis()
        if r is None:
            # Fallback to in-memory
            is_limited, retry_after = self._fallback_check(client_id)
        else:
            try:
                key = f"ratelimit:{client_id}"
                pipe = r.pipeline()
                pipe.incr(key)
                pipe.expire(key, 60, nx=True)
                results = await pipe.execute()
                current_count = results[0]

                if current_count > self.requests_per_minute:
                    ttl = await r.ttl(key)
                    retry_after = max(ttl, 1)
                    is_limited = True
                else:
                    is_limited = False
                    retry_after = 0
            except Exception:
                logger.debug("Redis rate limit error — falling back to in-memory")
                is_limited, retry_after = self._fallback_check(client_id)

        if is_limited:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Retry in {retry_after}s."},
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limit request body size to prevent DoS attacks."""

    def __init__(self, app, max_size_bytes: int = 10 * 1024 * 1024):
        super().__init__(app)
        self.max_size_bytes = max_size_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > self.max_size_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Request too large. Maximum size: {self.max_size_bytes / 1024 / 1024:.1f}MB"
                        },
                    )
            except ValueError:
                pass

        return await call_next(request)
