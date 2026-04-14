"""
Middleware registration for the FastAPI app.

Extracted from main.py for maintainability.
Order matters: middleware is applied in reverse registration order
(last added = first executed for the request).
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware.csrf import CSRFProtectionMiddleware
from app.middleware.security import (
    RedisRateLimitMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)


def register_middleware(app: FastAPI) -> None:
    """Register all middleware on the FastAPI app instance."""
    is_production = os.getenv("ENVIRONMENT", "").lower() == "production"

    # CSRF protection (applied first in the chain)
    csrf_enabled = os.getenv("ENABLE_CSRF_PROTECTION", "true").lower() == "true"
    app.add_middleware(CSRFProtectionMiddleware, enabled=csrf_enabled)

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Rate limiting — Redis-backed with in-memory fallback
    rate_limit_rpm = int(os.getenv("RATE_LIMIT_PER_MINUTE", "1000"))
    rate_limit_burst = int(os.getenv("RATE_LIMIT_BURST", "100"))
    app.add_middleware(
        RedisRateLimitMiddleware,
        requests_per_minute=rate_limit_rpm,
        burst=rate_limit_burst,
        redis_url=os.getenv("REDIS_URL", ""),
    )

    # Request size limit
    max_request_size = int(os.getenv("MAX_REQUEST_SIZE_BYTES", str(10 * 1024 * 1024)))
    app.add_middleware(RequestSizeLimitMiddleware, max_size_bytes=max_request_size)

    # CORS
    _register_cors(app, is_production)


def _register_cors(app: FastAPI, is_production: bool) -> None:
    """Configure CORS middleware."""
    origins = [
        "https://primustech.in",
        "https://www.primustech.in",
        "https://primusadmin.in",
        "https://www.primusadmin.in",
        "https://api.primusadmin.in",
        "https://api.primustech.in",
        "https://primusinfotech.com",
        "https://www.primusinfotech.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
    ]

    allow_all_cors = os.getenv("ALLOW_ALL_CORS", "false").lower() == "true"

    if allow_all_cors and is_production:
        raise ValueError("ALLOW_ALL_CORS cannot be true in production.")

    if allow_all_cors and not is_production:
        app.add_middleware(
            CORSMiddleware,
            allow_origin_regex=".*",
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["*"],
        )
    else:
        allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
        if allowed_origins_env:
            origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

        if is_production:
            if not origins:
                raise ValueError("ALLOWED_ORIGINS must be set in production.")
            if any(o == "*" for o in origins):
                raise ValueError("Wildcard '*' not allowed in production ALLOWED_ORIGINS.")

        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["*"],
        )
