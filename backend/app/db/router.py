"""
CafeDBRouter - Manages per-cafe database connections with LRU caching.

Each cafe has its own PostgreSQL database (primus_cafe_{cafe_id}).
The router maintains an LRU cache of SQLAlchemy engines to avoid
creating new connections for every request while bounding total
connection usage.
"""

import logging
import os
import threading
from collections import OrderedDict
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

GLOBAL_DATABASE_URL = os.getenv("GLOBAL_DATABASE_URL", DATABASE_URL)
# Reduced defaults to prevent PostgreSQL connection exhaustion
# Old: 100 × (3+5) = 800 connections  →  New: 50 × (2+3) = 250 connections
CAFE_DB_ENGINE_CACHE_SIZE = int(os.getenv("CAFE_DB_ENGINE_CACHE_SIZE", "50"))
CAFE_DB_POOL_SIZE = int(os.getenv("CAFE_DB_POOL_SIZE", "2"))
CAFE_DB_MAX_OVERFLOW = int(os.getenv("CAFE_DB_MAX_OVERFLOW", "3"))

# When using PgBouncer, use NullPool (PgBouncer manages connections)
USE_PGBOUNCER = os.getenv("USE_PGBOUNCER", "false").lower() == "true"


# Cafe DB naming pattern. Override via env var to match your install's
# database naming convention. Examples:
#   primus_cafe_{cafe_id}    (default, legacy Primus)
#   clutchhh_cafe_{cafe_id}  (new ClutchHH install)
# Must contain literal "{cafe_id}" — replaced at runtime via str.format.
CAFE_DB_NAME_PATTERN = os.getenv("CAFE_DB_NAME_PATTERN", "primus_cafe_{cafe_id}")


def derive_cafe_db_name(cafe_id: int) -> str:
    """Public helper: returns the database name for a given cafe_id."""
    try:
        return CAFE_DB_NAME_PATTERN.format(cafe_id=cafe_id)
    except (KeyError, IndexError):
        # Pattern is malformed; fall back to safe default
        logger.error(
            "Invalid CAFE_DB_NAME_PATTERN=%r; falling back to primus_cafe_{cafe_id}",
            CAFE_DB_NAME_PATTERN,
        )
        return f"primus_cafe_{cafe_id}"


def _derive_cafe_url(cafe_id: int) -> str:
    """Derive cafe database URL from global URL by replacing DB name."""
    parsed = urlparse(GLOBAL_DATABASE_URL)
    # Replace path (database name) with cafe-specific name
    cafe_db_name = derive_cafe_db_name(cafe_id)
    new_parsed = parsed._replace(path=f"/{cafe_db_name}")
    return urlunparse(new_parsed)


class CafeDBRouter:
    """
    Thread-safe LRU cache of per-cafe SQLAlchemy engines.

    At any given moment, only ~50-100 cafes are actively making requests
    (typical gaming cafe operating hours). Each cached engine holds
    pool_size connections. When the cache is full, the least-recently-used
    engine is disposed.
    """

    def __init__(
        self,
        max_size: int = CAFE_DB_ENGINE_CACHE_SIZE,
        pool_size: int = CAFE_DB_POOL_SIZE,
        max_overflow: int = CAFE_DB_MAX_OVERFLOW,
    ):
        self._max_size = max_size
        self._pool_size = pool_size
        self._max_overflow = max_overflow
        self._engines: OrderedDict[int, Engine] = OrderedDict()
        self._session_factories: dict[int, sessionmaker] = {}
        self._lock = threading.Lock()

    def get_engine(self, cafe_id: int) -> Engine:
        """Get or create an engine for the given cafe."""
        with self._lock:
            if cafe_id in self._engines:
                # Move to end (most recently used)
                self._engines.move_to_end(cafe_id)
                return self._engines[cafe_id]

            # Evict LRU if at capacity
            while len(self._engines) >= self._max_size:
                evicted_id, evicted_engine = self._engines.popitem(last=False)
                self._session_factories.pop(evicted_id, None)
                logger.info("Evicting cafe DB engine for cafe_id=%d", evicted_id)
                try:
                    evicted_engine.dispose()
                except Exception:
                    logger.exception("Error disposing engine for cafe_id=%d", evicted_id)

            # Create new engine
            url = _derive_cafe_url(cafe_id)
            if USE_PGBOUNCER:
                from sqlalchemy.pool import NullPool

                engine = create_engine(
                    url,
                    poolclass=NullPool,
                    pool_pre_ping=True,
                    future=True,
                )
            else:
                engine = create_engine(
                    url,
                    pool_pre_ping=True,
                    pool_size=self._pool_size,
                    max_overflow=self._max_overflow,
                    pool_recycle=1800,  # Recycle connections every 30 minutes
                    future=True,
                )
            self._engines[cafe_id] = engine
            self._session_factories[cafe_id] = sessionmaker(
                autocommit=False, autoflush=False, bind=engine,
            )
            logger.info("Created cafe DB engine for cafe_id=%d", cafe_id)
            return engine

    def get_session(self, cafe_id: int) -> Session:
        """Get a new session for the given cafe database."""
        self.get_engine(cafe_id)  # ensure engine exists
        with self._lock:
            factory = self._session_factories[cafe_id]
        return factory()

    def dispose_all(self):
        """Dispose all cached engines. Call on shutdown."""
        with self._lock:
            for cafe_id, engine in self._engines.items():
                try:
                    engine.dispose()
                except Exception:
                    logger.exception("Error disposing engine for cafe_id=%d", cafe_id)
            self._engines.clear()
            self._session_factories.clear()
            logger.info("All cafe DB engines disposed")

    def remove(self, cafe_id: int):
        """Remove a specific cafe engine from cache."""
        with self._lock:
            engine = self._engines.pop(cafe_id, None)
            self._session_factories.pop(cafe_id, None)
            if engine:
                try:
                    engine.dispose()
                except Exception:
                    logger.exception("Error disposing engine for cafe_id=%d", cafe_id)

    @property
    def cached_count(self) -> int:
        """Number of currently cached engines."""
        with self._lock:
            return len(self._engines)


# Module-level singleton
cafe_db_router = CafeDBRouter()
