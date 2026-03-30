"""
Global database engine and session factory.

The global database (primus_global) stores platform-level data:
- UserGlobal (identity, auth)
- Cafe (tenant registry)
- Subscription / Invoice (cafe billing)
- PlatformFinancialAudit (append-only audit mirror)
- License / LicenseKey
- RefreshToken / PasswordResetToken
- UserCafeMap
"""

import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

# Global database URL - falls back to DATABASE_URL for backward compat
import os
GLOBAL_DATABASE_URL = os.getenv("GLOBAL_DATABASE_URL", DATABASE_URL)

if "sqlite" in GLOBAL_DATABASE_URL.lower():
    raise RuntimeError(
        f"SQLite is not allowed for Primus global DB. "
        f"Got GLOBAL_DATABASE_URL={GLOBAL_DATABASE_URL!r}"
    )

logger.info("Primus GLOBAL_DATABASE_URL resolved to %r", GLOBAL_DATABASE_URL)

global_engine = create_engine(
    GLOBAL_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    future=True,
)

global_session_factory = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=global_engine,
)

GlobalBase = declarative_base()
