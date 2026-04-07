"""
FastAPI dependency functions for database sessions.

Provides three dependencies:
- get_global_db() - session for the global database (users, cafes, subscriptions)
- get_cafe_db()   - session for the current cafe's database (wallet, sessions, etc.)
- get_db()        - backward-compatible shim that routes based on MULTI_DB_ENABLED
"""

import logging
import os
from collections.abc import Generator
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.global_db import global_session_factory
from app.db.router import cafe_db_router

logger = logging.getLogger(__name__)

MULTI_DB_ENABLED = os.getenv("MULTI_DB_ENABLED", "false").lower() == "true"


def get_global_db() -> Generator[Session, None, None]:
    """Yield a session for the global (platform) database."""
    db = global_session_factory()
    try:
        yield db
    finally:
        db.close()


def get_cafe_db(request: Request) -> Generator[Session, None, None]:
    """
    Yield a session for the current cafe's database.

    Extracts cafe_id from the request state (set by auth middleware/dependency).
    Falls back to JWT payload extraction if not set.

    When MULTI_DB_ENABLED=false the system runs in single-DB mode and there
    are no per-cafe databases to route to. In that case we transparently
    return the global session so all the legacy endpoints that aliased
    `get_cafe_db as get_db` continue to work without modification.
    """
    if not MULTI_DB_ENABLED:
        db = global_session_factory()
        try:
            yield db
        finally:
            db.close()
        return

    cafe_id = _extract_cafe_id(request)
    if cafe_id is None:
        raise HTTPException(
            status_code=400,
            detail="cafe_id is required for this operation",
        )
    db = cafe_db_router.get_session(cafe_id)
    try:
        yield db
    finally:
        db.close()


def get_cafe_db_by_id(cafe_id: int) -> Generator[Session, None, None]:
    """Yield a session for a specific cafe database by ID (for internal/admin use)."""
    db = cafe_db_router.get_session(cafe_id)
    try:
        yield db
    finally:
        db.close()


def get_db(request: Request = None) -> Generator[Session, None, None]:
    """
    Backward-compatible database dependency.

    When MULTI_DB_ENABLED=false (default): returns a session for the single
    existing database (same as the old get_db).

    When MULTI_DB_ENABLED=true: routes to the cafe database if a cafe_id
    is available in the request, otherwise returns the global database.
    """
    # NOTE: do NOT re-import global_session_factory inside this function.
    # An inline `from ... import global_session_factory` makes Python treat
    # the name as a function-local variable for the ENTIRE function body,
    # which causes UnboundLocalError on the multi-DB else-branch when the
    # if-branch wasn't taken. The module-level import at the top of this
    # file is the single source of truth.
    if not MULTI_DB_ENABLED:
        # Legacy single-DB mode
        db = global_session_factory()
        try:
            yield db
        finally:
            db.close()
        return

    # Multi-DB mode: try to route to cafe DB
    cafe_id = _extract_cafe_id(request) if request else None
    if cafe_id is not None:
        db = cafe_db_router.get_session(cafe_id)
    else:
        db = global_session_factory()
    try:
        yield db
    finally:
        db.close()


ENABLE_RLS = os.getenv("ENABLE_RLS", "false").lower() == "true"


def get_db_with_tenant(request: Request = None) -> Generator[Session, None, None]:
    """
    Database dependency with tenant context injection for RLS.

    Sets PostgreSQL session-level variables so RLS policies can
    reference app.current_user_id and app.current_user_role.

    Use this instead of get_db() in financial endpoints when ENABLE_RLS=true.
    """
    # See note in get_db: do NOT re-import global_session_factory here.
    if not MULTI_DB_ENABLED:
        db = global_session_factory()
        try:
            if ENABLE_RLS and request:
                _set_tenant_context(db, request)
            yield db
        finally:
            db.close()
        return

    cafe_id = _extract_cafe_id(request) if request else None
    if cafe_id is not None:
        db = cafe_db_router.get_session(cafe_id)
    else:
        db = global_session_factory()

    try:
        if ENABLE_RLS and request:
            _set_tenant_context(db, request)
        yield db
    finally:
        db.close()


def _set_tenant_context(db: Session, request: Request) -> None:
    """Inject tenant context into the PostgreSQL session for RLS policies."""
    try:
        from sqlalchemy import text

        user_id = getattr(request.state, "user_id", None)
        user_role = getattr(request.state, "user_role", "client")

        if user_id is not None:
            db.execute(text("SET app.current_user_id = :uid"), {"uid": str(user_id)})
        if user_role:
            db.execute(text("SET app.current_user_role = :role"), {"role": user_role})
    except Exception:
        logger.debug("Could not set tenant context for RLS (may not be in a transaction)")


def _extract_cafe_id(request: Optional[Request]) -> Optional[int]:
    """
    Extract cafe_id from the request.

    Checks (in order):
    1. request.state.cafe_id (set by get_auth_context dependency)
    2. JWT access token in cookie or Authorization header (verified)
    3. X-Cafe-Id header (for internal services only)

    The JWT path is critical because not every endpoint depends on
    get_auth_context — many legacy endpoints only use get_current_user
    which doesn't populate request.state. Without this fallback, those
    endpoints would 400 with "cafe_id is required" in multi-DB mode.
    """
    if request is None:
        return None

    # 1. Check request state (set by get_auth_context)
    cafe_id = getattr(request.state, "cafe_id", None)
    if cafe_id is not None:
        try:
            return int(cafe_id)
        except (ValueError, TypeError):
            pass

    # 2. Try to decode the access token directly (verified) and read its
    #    cafe_id claim. Cache the result on request.state so we don't
    #    decode the same JWT multiple times in one request.
    token = _extract_token_from_request(request)
    if token:
        try:
            from app.auth.tokens import decode_access_token

            claims = decode_access_token(token)
            if claims:
                jwt_cafe = claims.get("cafe_id")
                if jwt_cafe is not None:
                    try:
                        cafe_int = int(jwt_cafe)
                        # Cache for downstream consumers
                        try:
                            request.state.cafe_id = cafe_int
                        except Exception:
                            pass
                        return cafe_int
                    except (ValueError, TypeError):
                        pass
        except Exception:
            # Don't crash request routing on token parse errors —
            # the actual auth dependency will reject the request.
            pass

    # 3. Check header (internal services / cross-cafe admin tools)
    header_val = request.headers.get("X-Cafe-Id")
    if header_val is not None:
        try:
            return int(header_val)
        except (ValueError, TypeError):
            pass

    return None


def _extract_token_from_request(request: Request) -> Optional[str]:
    """Get the JWT access token from cookie or Authorization header."""
    # 1. httpOnly cookie (preferred — set by login endpoint)
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        if cookie_token.startswith("Bearer "):
            return cookie_token.split(" ", 1)[1]
        return cookie_token

    # 2. Authorization: Bearer <token>
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]

    return None
