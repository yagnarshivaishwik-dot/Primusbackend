import logging
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = DATABASE_URL

# Extra safety: if any environment source still injects a SQLite URL, fail fast
# with a clear error rather than allowing a confusing reload loop.
# Skip this check if we are in a test environment
if "sqlite" in SQLALCHEMY_DATABASE_URL.lower():
    raise RuntimeError(
        f"SQLite is not allowed for Primus; check environment variables. "
        f"Got DATABASE_URL={SQLALCHEMY_DATABASE_URL!r}"
    )

logger.info("Primus DATABASE_URL resolved to %r", SQLALCHEMY_DATABASE_URL)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# FastAPI dependency to provide a DB session per request


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
