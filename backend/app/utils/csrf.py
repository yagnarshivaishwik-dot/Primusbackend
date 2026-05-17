"""
CSRF protection utilities for FastAPI.
Implements double-submit cookie pattern for stateless CSRF protection.
"""

import hmac
import os
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

    # Skip for health checks and public endpoints.
    skip_paths = [
        "/health",
        "/",
        "/api/docs",
        "/api/openapi.json",
        "/api/redoc",
    ]

    # NOTE: OTP and agent endpoints are intentionally excluded from CSRF to avoid
    # blocking desktop/LAN agents (kiosk clients) where cookies/headers may not
    # be propagated correctly. They still enforce their own validation.
    skip_paths.extend(
        [
            "/api/send-otp/",
            "/api/send-otp",
            "/api/verify-otp/",
            "/api/verify-otp",
            # PC agent registration + heartbeat: authenticated at agent level,
            # and only callable from LAN/desktop clients.
            "/api/clientpc/register",
            "/api/clientpc/register/",
            "/api/clientpc/heartbeat",
        ]
    )

    # Desktop/Tauri clients cannot handle CSRF cookies properly, so we skip
    # CSRF for auth endpoints. These endpoints are protected by password/token validation.
    # Both legacy /api/auth/* and v1-prefixed /api/v1/auth/* are listed because the
    # FastAPI router mounts the same handlers under both prefixes (see main.py),
    # and the kiosk React UI hits the /api/v1/ variants.
    skip_paths.extend(
        [
            "/api/auth/register",
            "/api/auth/register/",
            "/api/auth/login",
            "/api/auth/login/",
            "/api/auth/refresh",
            "/api/auth/refresh/",
            "/api/auth/logout",
            "/api/auth/logout/",
            "/api/auth/me",
            "/api/auth/me/",
            "/api/v1/auth/register",
            "/api/v1/auth/register/",
            "/api/v1/auth/login",
            "/api/v1/auth/login/",
            "/api/v1/auth/refresh",
            "/api/v1/auth/refresh/",
            "/api/v1/auth/logout",
            "/api/v1/auth/logout/",
            "/api/v1/auth/me",
            "/api/v1/auth/me/",
            # Social auth also needs to bypass for mobile/desktop flows
            "/api/social/google",
            "/api/social/google/",
            "/api/v1/social/google",
            "/api/v1/social/google/",
        ]
    )

    # Public cafe onboarding — no session/cookie auth, called cross-origin
    # from the marketing site. Protected by email uniqueness + rate limiting.
    skip_paths.extend(
        [
            "/api/cafe/onboard",
            "/api/cafe/onboard/",
        ]
    )

    # Cashfree payment webhook — server-to-server POST from Cashfree's side.
    # Authenticated by HMAC-SHA256 signature (X-Webhook-Signature) against
    # CASHFREE_WEBHOOK_SECRET in our handler. No browser cookie involved, so
    # CSRF cannot and should not apply.
    skip_paths.extend(
        [
            "/api/v1/payment/cashfree/webhook",
            "/api/v1/payment/cashfree/webhook/",
            "/api/payment/cashfree/webhook",
            "/api/payment/cashfree/webhook/",
        ]
    )
    if request.url.path in skip_paths:
        return True

    # Admin API endpoints require JWT auth but may not have CSRF cookies
    # These are called from admin portal which may not properly propagate cookies
    admin_api_prefixes = [
        "/api/pc/",           # PC management
        "/api/user/",         # User management
        "/api/offer/",        # Offer/time management
        "/api/clientpc/",     # Client PC management
        "/api/settings/",     # Settings management
        "/api/billing/",      # Billing management
        "/api/command/",      # Remote command management
        "/api/wallet/",       # Wallet management
        "/api/shop/",         # Shop management
        "/api/payment/",      # Payment (Cashfree, UPI)
        "/api/cafe/",         # Cafe (onboarding etc.)
        "/api/event/",        # Events
        "/api/prize/",        # Prizes
        "/api/leaderboard/",  # Leaderboard
        "/api/games/",        # Games CRUD
        "/api/arcade/",       # Arcade
        # v1-mounted duplicates (kiosk React UI uses these prefixes)
        "/api/v1/pc/",
        "/api/v1/user/",
        "/api/v1/offer/",
        "/api/v1/clientpc/",
        "/api/v1/settings/",
        "/api/v1/billing/",
        "/api/v1/command/",
        "/api/v1/wallet/",
        "/api/v1/shop/",
        "/api/v1/payment/",
        "/api/v1/cafe/",
        "/api/v1/event/",
        "/api/v1/prize/",
        "/api/v1/leaderboard/",
        "/api/v1/games/",
        "/api/v1/arcade/",
        "/api/v1/announcement/",
        "/api/v1/analytics/",
        "/api/v1/audit/",
        # Internal/superadmin dashboard (Primus-SuperAdmin-main is a browser
        # app served from a different origin and uses Bearer-token auth, so
        # CSRF cookie/header can't propagate).
        "/api/internal/",
        "/api/v1/internal/",
        # Admin-side panels missing from the original list (each one breaks a
        # feature in primus-admin-main with a 403 CSRF error if omitted):
        "/api/quests/",
        "/api/v1/quests/",
        "/api/pcban/",
        "/api/v1/pcban/",
        "/api/pcgroup/",
        "/api/v1/pcgroup/",
        "/api/pcadmin/",
        "/api/v1/pcadmin/",
        "/api/device/",
        "/api/v1/device/",
        "/api/admin/sessions/",
        "/api/v1/admin/sessions/",
        "/api/admin/events/",
        "/api/v1/admin/events/",
        "/api/subscription/",
        "/api/v1/subscription/",
        "/api/invoices/",
        "/api/v1/invoices/",
        "/api/reports/",
        "/api/v1/reports/",
        # UPI provider (Razorpay/other) — webhook is server-to-server, the
        # other two are kiosk-initiated. None can carry a CSRF cookie.
        "/api/upi/",
        "/api/v1/upi/",
        # Misc admin-side routers that exist but were never added:
        "/api/membership/",
        "/api/v1/membership/",
        "/api/booking/",
        "/api/v1/booking/",
        "/api/campaign/",
        "/api/v1/campaign/",
        "/api/coupon/",
        "/api/v1/coupon/",
        "/api/staff/",
        "/api/v1/staff/",
        "/api/support/",
        "/api/v1/support/",
        "/api/notification/",
        "/api/v1/notification/",
        "/api/announcement/",
        "/api/usergroup/",
        "/api/v1/usergroup/",
        "/api/profile/",
        "/api/v1/profile/",
        "/api/license/",
        "/api/v1/license/",
        "/api/hardware/",
        "/api/v1/hardware/",
        "/api/update/",
        "/api/v1/update/",
        "/api/backup/",
        "/api/v1/backup/",
        "/api/screenshot/",
        "/api/v1/screenshot/",
        "/api/audit/",
        "/api/webhook/",
        "/api/v1/webhook/",
        "/api/security/",
        "/api/v1/security/",
        "/api/session/",
        "/api/v1/session/",
        "/api/chat/",
        "/api/v1/chat/",
        "/api/stats/",
        "/api/v1/stats/",
        "/api/game/",
        "/api/v1/game/",
        "/api/analytics/",
    ]
    for prefix in admin_api_prefixes:
        if request.url.path.startswith(prefix):
            return True

    return False
