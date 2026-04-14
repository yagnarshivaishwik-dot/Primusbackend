"""
Cafe database provisioning.

Creates new PostgreSQL databases for cafes and runs schema migrations.
"""

import logging
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.db.cafe_db import CafeBase
from app.db.router import _derive_cafe_url, cafe_db_router, derive_cafe_db_name

logger = logging.getLogger(__name__)


def provision_cafe_database(cafe_id: int, owner_global_user_id: int = None) -> bool:
    """
    Create and initialize a new cafe database.

    Steps:
    1. CREATE DATABASE primus_cafe_{cafe_id}
    2. Create all cafe schema tables
    3. Seed initial data (owner user)
    4. Register engine in router cache

    Args:
        cafe_id: The cafe ID (from global cafes table)
        owner_global_user_id: Global user ID of the cafe owner (for seeding)

    Returns:
        True if successful, False on error
    """
    db_name = derive_cafe_db_name(cafe_id)
    cafe_url = _derive_cafe_url(cafe_id)

    try:
        # Step 1: Create the database
        # Must use AUTOCOMMIT since CREATE DATABASE cannot run inside a transaction
        _create_database(db_name)

        # Step 2: Create all tables from CafeBase metadata
        # Import models_cafe to ensure all models are registered on CafeBase
        import app.db.models_cafe  # noqa
        engine = create_engine(cafe_url, pool_pre_ping=True, future=True)
        CafeBase.metadata.create_all(bind=engine)
        logger.info("Created schema for cafe database %s", db_name)

        # Step 3: Seed initial data
        if owner_global_user_id is not None:
            _seed_cafe_data(engine, cafe_id, owner_global_user_id)

        # Step 4: Register in router cache
        engine.dispose()  # dispose temp engine; router will create its own
        cafe_db_router.get_engine(cafe_id)
        logger.info("Provisioned cafe database %s successfully", db_name)
        return True

    except Exception:
        logger.exception("Failed to provision cafe database %s", db_name)
        return False


def _create_database(db_name: str):
    """Create a new PostgreSQL database using an admin connection."""
    from app.db.global_db import GLOBAL_DATABASE_URL

    # Connect to the default 'postgres' maintenance database to issue CREATE DATABASE
    admin_url = os.getenv("ADMIN_DATABASE_URL", GLOBAL_DATABASE_URL)

    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with engine.connect() as conn:
            # Check if database already exists
            result = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name},
            )
            if result.scalar():
                logger.info("Database %s already exists, skipping creation", db_name)
                return

            # Create database (identifier cannot be parameterized, but cafe_id is an int
            # so this is safe from injection)
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
            logger.info("Created database %s", db_name)
    finally:
        engine.dispose()


def _seed_cafe_data(engine, cafe_id: int, owner_global_user_id: int):
    """Seed initial data into a newly created cafe database."""
    from sqlalchemy.orm import sessionmaker
    factory = sessionmaker(bind=engine)
    db = factory()
    try:
        # Import cafe models here to avoid circular imports
        from app.db.models_cafe import CafeUser

        # Check if owner already seeded
        existing = db.query(CafeUser).filter_by(global_user_id=owner_global_user_id).first()
        if existing:
            return

        owner = CafeUser(
            global_user_id=owner_global_user_id,
            role="cafeadmin",
            wallet_balance=0,
            coins_balance=0,
        )
        db.add(owner)
        db.commit()
        logger.info("Seeded owner user for cafe %d", cafe_id)
    except Exception:
        db.rollback()
        logger.exception("Error seeding cafe data for cafe %d", cafe_id)
    finally:
        db.close()


def drop_cafe_database(cafe_id: int) -> bool:
    """
    Drop a cafe database. USE WITH EXTREME CAUTION.

    Only for development/testing. Never call in production without
    explicit admin confirmation.
    """
    db_name = derive_cafe_db_name(cafe_id)
    from app.db.global_db import GLOBAL_DATABASE_URL

    # Remove from router first
    cafe_db_router.remove(cafe_id)

    admin_url = os.getenv("ADMIN_DATABASE_URL", GLOBAL_DATABASE_URL)
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with engine.connect() as conn:
            # Terminate existing connections
            conn.execute(text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :name AND pid <> pg_backend_pid()"
            ), {"name": db_name})
            conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))
            logger.info("Dropped database %s", db_name)
            return True
    except Exception:
        logger.exception("Failed to drop database %s", db_name)
        return False
    finally:
        engine.dispose()
