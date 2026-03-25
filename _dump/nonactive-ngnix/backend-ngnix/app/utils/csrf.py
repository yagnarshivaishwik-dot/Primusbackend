"""
CSRF protection utilities for FastAPI.
Implements double-submit cookie pattern for stateless CSRF protection.
"""

import hmac
import secrets

from fastapi import Request


def generate_csrf_token() -> str:
    """Generate a random CSRF token."""
    return secrets.token_urlsafe(32)


def verify_csrf_token(token: str, cookie_token: str) -> bool:
    """
    Verify CSRF token using double-submit cookie pattern.

    Args:
        token: CSRF token from request header/form
        cookie_token: CSRF token from cookie

    Returns:
        True if tokens match, False otherwise
    """
    if not token or not cookie_token:
        return False

    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(token.encode(), cookie_token.encode())


def get_csrf_token_from_request(request: Request) -> str | None:
    """
    Extract CSRF token from request.
    Checks X-CSRF-Token header first, then form data.

    Args:
        request: FastAPI request object

    Returns:
        CSRF token if found, None otherwise
    """
    # Check header first (preferred for AJAX requests)
    token = request.headers.get("X-CSRF-Token")
    if token:
        return token

    # Check form data (for traditional form submissions)
    if hasattr(request, "_form"):
        form = request._form
        if isinstance(form, dict) and "csrf_token" in form:
            token = form.get("csrf_token")
            if isinstance(token, str):
                return token

    return None


def get_csrf_cookie_name() -> str:
    """Get CSRF cookie name."""
    return "csrf_token"


def should_skip_csrf_check(request: Request) -> bool:
    """
    Determine if CSRF check should be skipped for this request.

    Safe methods (GET, HEAD, OPTIONS) don't need CSRF protection.
    Also skip for health checks and public endpoints.

    Args:
        request: FastAPI request object

    Returns:
        True if CSRF check should be skipped
    """
    # Safe methods don't modify state
    if request.method in ["GET", "HEAD", "OPTIONS"]:
        return True

    # Skip for health checks and public endpoints
    skip_paths = ["/health", "/", "/api/docs", "/api/openapi.json", "/api/redoc"]
    if request.url.path in skip_paths:
        return True

    return False
