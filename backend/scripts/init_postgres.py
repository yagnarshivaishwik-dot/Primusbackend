"""
Initialize PostgreSQL for Primus:

- Validates DATABASE_URL is PostgreSQL.
- Ensures the target database exists (creating it if missing).
- Applies Alembic migrations.
- Runs a simple test query to validate connectivity.

Intended to be run inside WSL2 / Docker Desktop environments where Postgres
is reachable at the host/port specified by DATABASE_URL.
"""

import logging
import os
import sys

import sqlalchemy as sa
from alembic.config import Config
from sqlalchemy.engine import make_url

from alembic import command

# Ensure the backend root (containing the `app` package) is on sys.path
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(HERE)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.config import DATABASE_URL
from app.database import engine
from app.models import Base

logger = logging.getLogger("primus.init_postgres")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def ensure_database_exists():
    url = make_url(DATABASE_URL)

    if url.drivername.split("+", 1)[0] != "postgresql":
        logger.error("DATABASE_URL must use the postgresql scheme, got %r", url.drivername)
        sys.exit(1)

    db_name = url.database
    admin_url = url.set(database="postgres")

    logger.info("Ensuring database %r exists...", db_name)
    admin_engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    with admin_engine.connect() as conn:
        result = conn.execute(
            sa.text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
        )
        exists = result.scalar() == 1
        if not exists:
            conn.execute(sa.text(f'CREATE DATABASE "{db_name}"'))
            logger.info("Created database %r", db_name)
        else:
            logger.info("Database %r already exists", db_name)


def apply_migrations():
    logger.info("Applying Alembic migrations...")
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(here, "alembic.ini")
    cfg = Config(alembic_ini)
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations applied successfully.")


def test_connection():
    logger.info("Running test query against PostgreSQL...")
    engine = sa.create_engine(DATABASE_URL, future=True)
    with engine.connect() as conn:
        value = conn.execute(sa.text("SELECT 1")).scalar_one()
        logger.info("Test query returned: %s", value)


def ensure_base_schema():
    """
    Ensure all SQLAlchemy models have corresponding tables before running
    Alembic migrations. This is needed because our current Alembic history
    only adds indexes, assuming the base tables already exist.
    """
    logger.info("Ensuring base schema (SQLAlchemy models) exists...")
    Base.metadata.create_all(bind=engine)


def main():
    logger.info("Initializing PostgreSQL for Primus...")
    ensure_database_exists()
    ensure_base_schema()
    apply_migrations()
    test_connection()
    logger.info("PostgreSQL initialization complete.")


if __name__ == "__main__":
    main()
