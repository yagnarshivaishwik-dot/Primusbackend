"""
Security middleware for FastAPI application.
Includes security headers, rate limiting, and request size limits.
"""

import os
import time
from collections import defaultdict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # HSTS (only for HTTPS)
        if request.url.scheme == "https":
            # Default to 2 years with preload for production-grade hardening
            max_age = int(os.getenv("HSTS_MAX_AGE", "63072000"))
            response.headers["Strict-Transport-Security"] = (
                f"max-age={max_age}; includeSubDomains; preload"
            )

        # Content Security Policy - STRICT by default
        # Override via CONTENT_SECURITY_POLICY env var if needed
        csp = os.getenv(
            "CONTENT_SECURITY_POLICY",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        )
        response.headers["Content-Security-Policy"] = csp

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiting middleware."""

    def __init__(self, app, requests_per_minute: int = 60, burst: int = 10):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.burst = burst
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._cleanup_interval = 300  # Clean up every 5 minutes
        self._last_cleanup = time.time()

    def _cleanup_old_entries(self):
        """Remove old entries to prevent memory leak."""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        cutoff = now - 60  # Remove entries older than 1 minute
        for key in list(self._requests.keys()):
            self._requests[key] = [ts for ts in self._requests[key] if ts > cutoff]
            if not self._requests[key]:
                del self._requests[key]

        self._last_cleanup = now

    def _get_client_id(self, request: Request) -> str:
        """
        Get client identifier for rate limiting.
        
        SECURITY: Only trust X-Forwarded-For from configured trusted proxies.
        """
        # Get trusted proxy IPs from env (comma-separated)
        trusted_proxies_str = os.getenv("TRUSTED_PROXIES", "")
        trusted_proxies = set(ip.strip() for ip in trusted_proxies_str.split(",") if ip.strip())
        
        client_host = request.client.host if request.client else None
        
        # Only trust X-Forwarded-For if request comes from a trusted proxy
        if client_host and client_host in trusted_proxies:
            forwarded_for = request.headers.get("X-Forwarded-For")
            if forwarded_for:
                # Take the LAST IP before the proxy (rightmost trusted chain)
                ips = [ip.strip() for ip in forwarded_for.split(",")]
                # Return first (original client) IP
                return ips[0] if ips else client_host
        
        # Not from trusted proxy - use direct client IP
        return client_host or "unknown"

    def _is_rate_limited(self, client_id: str) -> tuple[bool, int]:
        """
        Check if client is rate limited.

        Returns:
            Tuple of (is_limited, retry_after_seconds)
        """
        now = time.time()
        window_start = now - 60  # 1 minute window

        # Clean up old entries periodically
        self._cleanup_old_entries()

        # Get requests in current window
        requests = self._requests[client_id]
        requests = [ts for ts in requests if ts > window_start]
        self._requests[client_id] = requests

        # Check rate limit
        if len(requests) >= self.requests_per_minute:
            # Calculate retry after
            oldest_request = min(requests) if requests else now
            retry_after = int(60 - (now - oldest_request)) + 1
            return True, retry_after

        # Record this request
        requests.append(now)
        self._requests[client_id] = requests

        return False, 0

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/"]:
            return await call_next(request)

        client_id = self._get_client_id(request)
        is_limited, retry_after = self._is_rate_limited(client_id)

        if is_limited:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Please try again in {retry_after} second(s)."
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Limit request body size to prevent DoS attacks."""

    def __init__(self, app, max_size_bytes: int = 10 * 1024 * 1024):  # 10MB default
        super().__init__(app)
        self.max_size_bytes = max_size_bytes

    async def dispatch(self, request: Request, call_next):
        # Check Content-Length header
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
