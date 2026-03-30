"""
Database package for Primus multi-tenant architecture.

Provides separate database per cafe with a global database for
platform-level data (users, cafes, subscriptions, audit).
"""

from app.db.dependencies import get_cafe_db, get_db, get_global_db
from app.db.global_db import GlobalBase, global_engine, global_session_factory
from app.db.cafe_db import CafeBase
from app.db.router import cafe_db_router

__all__ = [
    "get_db",
    "get_global_db",
    "get_cafe_db",
    "GlobalBase",
    "CafeBase",
    "global_engine",
    "global_session_factory",
    "cafe_db_router",
]
