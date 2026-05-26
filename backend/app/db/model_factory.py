"""Model registry — single import-time resolution for ``if MULTI_DB_ENABLED``.

Forensic audit BUG: every endpoint that wrote to cafe-scoped tables had to
duplicate the same import branch::

    if MULTI_DB_ENABLED:
        from app.db.models_cafe import Offer, UserOffer, WalletTransaction
        from app.db.models_global import UserGlobal as User
    else:
        from app.models import Offer, User, UserOffer, WalletTransaction

11 files carried this idiom, each at risk of drift when a new model was
added. This registry resolves the choice exactly once at import time and
exposes the right classes via a single ``registry`` attribute.

Usage::

    from app.db.model_factory import registry

    wt = registry.WalletTransaction(user_id=u.id, amount=10.0)
    db.add(wt)

The registry MUST stay import-light — no DB connections, no settings reads
beyond ``MULTI_DB_ENABLED``. Endpoints can safely import it at module top
without triggering any side effect.
"""

from __future__ import annotations

import logging

from app.db.dependencies import MULTI_DB_ENABLED

logger = logging.getLogger(__name__)


class _ModelRegistry:
    """Lazy attribute lookup that resolves to the right ORM class.

    Implemented as ``__getattr__`` so importing this module doesn't pull in
    every model — slowing test startup and risking circular imports between
    ``app.models`` and ``app.db.models_*``. The first access to any name
    triggers the import for the side the deployment is configured for.
    """

    # Mapping of attribute name -> (cafe-scoped class import path, single-DB class import path)
    # Cafe-scoped models live in app.db.models_cafe; global in app.db.models_global.
    # Single-DB legacy lives in app.models.
    _MULTI_DB_PATHS: dict[str, tuple[str, str]] = {
        # Cafe-scoped (per-cafe DB in multi-DB mode)
        "WalletTransaction": ("app.db.models_cafe", "WalletTransaction"),
        "Offer": ("app.db.models_cafe", "Offer"),
        "UserOffer": ("app.db.models_cafe", "UserOffer"),
        "Session": ("app.db.models_cafe", "Session"),
        "ClientPC": ("app.db.models_cafe", "ClientPC"),
        "SystemEvent": ("app.db.models_cafe", "SystemEvent"),
        "ChatMessage": ("app.db.models_cafe", "ChatMessage"),
        "Coupon": ("app.db.models_cafe", "Coupon"),
        "CouponRedemption": ("app.db.models_cafe", "CouponRedemption"),
        "RemoteCommand": ("app.db.models_cafe", "RemoteCommand"),
        "Event": ("app.db.models_cafe", "Event"),
        "EventProgress": ("app.db.models_cafe", "EventProgress"),
        # Global (always live in app.db.models_global in multi-DB mode)
        "User": ("app.db.models_global", "UserGlobal"),
        "Cafe": ("app.db.models_global", "Cafe"),
        "License": ("app.db.models_global", "License"),
        "LicenseKey": ("app.db.models_global", "LicenseKey"),
        "ClientUpdate": ("app.db.models_global", "ClientUpdate"),
        "UserCafeMap": ("app.db.models_global", "UserCafeMap"),
        "RefreshToken": ("app.db.models_global", "RefreshToken"),
        "PasswordResetToken": ("app.db.models_global", "PasswordResetToken"),
    }

    def __init__(self) -> None:
        self._cache: dict[str, type] = {}

    def __getattr__(self, name: str) -> type:
        cached = self._cache.get(name)
        if cached is not None:
            return cached

        if MULTI_DB_ENABLED and name in self._MULTI_DB_PATHS:
            module_path, class_name = self._MULTI_DB_PATHS[name]
            module = __import__(module_path, fromlist=[class_name])
            cls = getattr(module, class_name)
        else:
            # Single-DB mode: everything is in app.models, with the same name
            # we're looking up (User stays User, Offer stays Offer, ...).
            module = __import__("app.models", fromlist=[name])
            cls = getattr(module, name)

        self._cache[name] = cls
        return cls

    def clear_cache(self) -> None:
        """Reset the lazy cache — for tests that flip MULTI_DB_ENABLED at runtime."""
        self._cache.clear()


registry = _ModelRegistry()

__all__ = ["registry"]
