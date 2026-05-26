"""FastAPI auth dependencies.

Forensic audit BUG: ``app/api/endpoints/auth.py`` had grown to 1,091 lines and
was imported 59 times across the codebase purely to get ``get_current_user``
and ``require_role``. Moving them here lets endpoint modules import the
behaviour they need without dragging in the entire HTTP-route module.

Back-compat: ``app/api/endpoints/auth.py`` re-exports the names below, so
existing callers (``from app.api.endpoints.auth import get_current_user``)
keep working unchanged.
"""

from __future__ import annotations

import logging
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import ALGORITHM, JWT_SECRET
from app.db.dependencies import get_global_db as get_db
from app.models import User

logger = logging.getLogger(__name__)


# Standard OAuth2 scheme — auto_error=False so we can fall back to cookies.
oauth2_scheme_header = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login", auto_error=False
)
oauth2_scheme = oauth2_scheme_header


async def get_token(
    request: Request,
    token_header: str | None = Depends(oauth2_scheme_header),
) -> str:
    """Extract JWT from cookie (preferred) or Authorization header."""
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        if cookie_token.startswith("Bearer "):
            return cookie_token.split(" ")[1]
        return cookie_token

    if token_header:
        return token_header

    raise HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(
    token: str = Depends(get_token), db: Session = Depends(get_db)
) -> User:
    """Resolve the calling User from the JWT bearer/cookie.

    Returns the User ORM row. Raises 401 on missing/invalid/expired tokens.
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception

    # Force-load the columns endpoint code immediately uses so a detached
    # session can't surface as an AttributeError later.
    _ = user.id, user.email, user.role, user.wallet_balance
    return user


def require_role(role: str) -> Callable:
    """Create a dependency that requires a specific role or higher.

    Delegates to :func:`app.auth.context.require_role` for unified hierarchy
    checking (superadmin > cafeadmin/admin/owner > staff > client), then
    unwraps the :class:`AuthContext` back to a plain :class:`User` so every
    existing endpoint keeps working without changes.
    """
    from app.auth.context import require_role as _ctx_require_role

    _ctx_checker = _ctx_require_role(role)

    def role_checker(ctx=Depends(_ctx_checker)) -> User:
        return ctx.user

    return role_checker


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Shorthand for endpoints that need admin or higher."""
    if current_user.role not in ("admin", "cafeadmin", "owner", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


def get_current_superadmin(
    current_user: User = Depends(get_current_user),
) -> User:
    """Shorthand for endpoints that need superadmin."""
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin role required")
    return current_user


__all__ = [
    "oauth2_scheme",
    "oauth2_scheme_header",
    "get_token",
    "get_current_user",
    "require_role",
    "get_current_admin",
    "get_current_superadmin",
]
