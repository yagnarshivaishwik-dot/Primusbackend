"""
Per-cafe database engine and session factory.

Each cafe gets its own PostgreSQL database named primus_cafe_{cafe_id}.
This module provides the CafeBase declarative base for cafe-scoped models.
Engine creation and caching is handled by the CafeDBRouter.
"""

from sqlalchemy.orm import declarative_base

CafeBase = declarative_base()
