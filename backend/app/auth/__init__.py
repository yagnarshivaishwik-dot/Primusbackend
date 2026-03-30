"""Authentication and authorization package for multi-tenant Primus backend."""

from app.auth.context import AuthContext, get_auth_context, require_role
from app.auth.device import validate_device
from app.auth.tenant import enforce_cafe_ownership, scoped_query
from app.auth.tokens import create_access_token, create_refresh_token, verify_refresh_token

__all__ = [
    "AuthContext",
    "get_auth_context",
    "require_role",
    "validate_device",
    "create_access_token",
    "create_refresh_token",
    "verify_refresh_token",
    "scoped_query",
    "enforce_cafe_ownership",
]
