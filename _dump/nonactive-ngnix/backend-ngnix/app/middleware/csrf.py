"""
CSRF protection middleware for FastAPI.
"""

import os

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.utils.csrf import (
    generate_csrf_token,
    get_csrf_token_from_request,
    should_skip_csrf_check,
    verify_csrf_token,
)


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """CSRF protection middleware using double-submit cookie pattern."""

    def __init__(self, app, enabled: bool = True, cookie_name: str = "csrf_token"):
        super().__init__(app)
        self.enabled = enabled and os.getenv("ENABLE_CSRF_PROTECTION", "true").lower() == "true"
        self.cookie_name = cookie_name
        self.cookie_secure = os.getenv("ENVIRONMENT", "").lower() == "production"
        self.cookie_samesite = os.getenv("CSRF_COOKIE_SAMESITE", "Strict")

    async def dispatch(self, request: Request, call_next):
        # Skip CSRF check for safe methods and public endpoints
        if should_skip_csrf_check(request):
            response = await call_next(request)
            # Set CSRF cookie for GET requests so forms can use it
            if request.method == "GET" and self.enabled:
                csrf_token = generate_csrf_token()
                response.set_cookie(
                    key=self.cookie_name,
                    value=csrf_token,
                    httponly=False,  # Must be readable by JavaScript for double-submit
                    secure=self.cookie_secure,
                    samesite=self.cookie_samesite,
                    max_age=3600 * 24,  # 24 hours
                )
            return response

        if not self.enabled:
            return await call_next(request)

        # Get CSRF token from cookie
        cookie_token = request.cookies.get(self.cookie_name)

        # Get CSRF token from request
        request_token = get_csrf_token_from_request(request)

        # Verify CSRF token
        if not cookie_token or not request_token:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing. Please refresh the page and try again."},
            )

        if not verify_csrf_token(request_token, cookie_token):
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid CSRF token. Please refresh the page and try again."},
            )

        # CSRF check passed, continue
        response = await call_next(request)

        # Refresh CSRF token on successful state-changing requests
        if request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            new_token = generate_csrf_token()
            response.set_cookie(
                key=self.cookie_name,
                value=new_token,
                httponly=False,
                secure=self.cookie_secure,
                samesite=self.cookie_samesite,
                max_age=3600 * 24,
            )

        return response
