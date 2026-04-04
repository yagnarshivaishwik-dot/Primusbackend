"""
One-time data migration script: Single DB -> Split DB architecture.

Migrates existing data from the single Primus database to:
1. primus_global - platform-level data
2. primus_cafe_{id} - per-cafe operational data

Usage:
    cd backend
    python -m scripts.split_databases

Prerequisites:
    - Set GLOBAL_DATABASE_URL and DATABASE_URL environment variables
    - Ensure PostgreSQL user has CREATEDB privilege
    - Back up the existing database before running

This script is idempotent - it can be safely re-run without duplicating data.
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def get_source_engine():
    """Connect to the existing single database."""
    url = os.getenv("DATABASE_URL")
    if not url:
        logger.error("DATABASE_URL not set")
        sys.exit(1)
    return create_engine(url, pool_pre_ping=True, future=True)


def get_global_engine():
    """Connect to the global database."""
    url = os.getenv("GLOBAL_DATABASE_URL", os.getenv("DATABASE_URL"))
    return create_engine(url, pool_pre_ping=True, future=True)


def migrate_global_tables(source_engine, global_engine):
    """
    Step 1: Ensure global tables exist and populate from source.

    Global tables: users, cafes, user_cafe_map, refresh_tokens,
    password_reset_tokens, licenses, license_keys, client_updates
    """
    logger.info("Migrating global tables...")

    # Create global schema
    from app.db.global_db import GlobalBase
    import app.db.models_global  # noqa: ensure models registered
    GlobalBase.metadata.create_all(bind=global_engine)
    logger.info("Global schema created")

    # The global DB initially IS the source DB (same URL), so tables
    # already have data. The new columns (db_provisioned) need defaults.
    Session = sessionmaker(bind=global_engine)
    db = Session()
    try:
        # Mark existing cafes as not yet provisioned
        db.execute(text(
            "UPDATE cafes SET db_provisioned = false "
            "WHERE db_provisioned IS NULL"
        ))
        db.commit()
        logger.info("Updated cafes.db_provisioned defaults")
    except Exception as e:
        db.rollback()
        logger.warning("Could not update cafes: %s (may need ALTER TABLE first)", e)
    finally:
        db.close()


def provision_cafe_databases(global_engine):
    """
    Step 2: Create per-cafe databases and copy data.
    """
    Session = sessionmaker(bind=global_engine)
    db = Session()

    try:
        cafes = db.execute(text("SELECT id, name FROM cafes")).fetchall()
        logger.info("Found %d cafes to provision", len(cafes))

        for cafe_id, cafe_name in cafes:
            logger.info("Processing cafe %d (%s)...", cafe_id, cafe_name)
            try:
                _provision_single_cafe(global_engine, cafe_id)
                db.execute(
                    text("UPDATE cafes SET db_provisioned = true, db_provisioned_at = NOW() WHERE id = :id"),
                    {"id": cafe_id},
                )
                db.commit()
                logger.info("Cafe %d provisioned successfully", cafe_id)
            except Exception:
                db.rollback()
                logger.exception("Failed to provision cafe %d", cafe_id)
    finally:
        db.close()


def _provision_single_cafe(global_engine, cafe_id: int):
    """Create a cafe database and copy its data."""
    from app.db.provisioning import provision_cafe_database
    from app.db.router import _derive_cafe_url, cafe_db_router

    # Create database and schema
    success = provision_cafe_database(cafe_id)
    if not success:
        raise RuntimeError(f"Failed to provision cafe {cafe_id}")

    # Copy data from source DB to cafe DB
    source_engine = get_source_engine()
    cafe_url = _derive_cafe_url(cafe_id)
    cafe_engine = create_engine(cafe_url, future=True)

    source_session = sessionmaker(bind=source_engine)()
    cafe_session = sessionmaker(bind=cafe_engine)()

    try:
        # Copy users for this cafe
        users = source_session.execute(
            text("SELECT id, name, email, role, wallet_balance, coins_balance, user_group_id "
                 "FROM users WHERE cafe_id = :cid"),
            {"cid": cafe_id},
        ).fetchall()

        for u in users:
            existing = cafe_session.execute(
                text("SELECT 1 FROM users WHERE global_user_id = :gid"),
                {"gid": u[0]},
            ).scalar()
            if not existing:
                cafe_session.execute(
                    text(
                        "INSERT INTO users (global_user_id, name, email, role, wallet_balance, coins_balance, user_group_id) "
                        "VALUES (:gid, :name, :email, :role, :wb, :cb, :ugid)"
                    ),
                    {"gid": u[0], "name": u[1], "email": u[2], "role": u[3],
                     "wb": u[4] or 0, "cb": u[5] or 0, "ugid": u[6]},
                )

        cafe_session.commit()
        logger.info("Copied %d users for cafe %d", len(users), cafe_id)

        # Copy wallet_transactions
        _copy_table_by_cafe(
            source_session, cafe_session, cafe_id,
            "wallet_transactions",
            "id, user_id, amount, timestamp, type, description",
        )

        # Copy sessions
        _copy_table_by_cafe(
            source_session, cafe_session, cafe_id,
            "sessions",
            "id, pc_id, user_id, start_time, end_time, paid, amount",
        )

        logger.info("Data migration complete for cafe %d", cafe_id)

    except Exception:
        cafe_session.rollback()
        raise
    finally:
        source_session.close()
        cafe_session.close()
        cafe_engine.dispose()


def _copy_table_by_cafe(source_session, cafe_session, cafe_id, table, columns):
    """Copy rows from source DB to cafe DB for a given cafe_id."""
    rows = source_session.execute(
        text(f"SELECT {columns} FROM {table} WHERE cafe_id = :cid"),
        {"cid": cafe_id},
    ).fetchall()

    if not rows:
        return

    cols = [c.strip() for c in columns.split(",")]
    for row in rows:
        # Check if already exists (by id)
        existing = cafe_session.execute(
            text(f"SELECT 1 FROM {table} WHERE id = :id"),
            {"id": row[0]},
        ).scalar()
        if existing:
            continue

        params = {cols[i]: row[i] for i in range(len(cols))}
        placeholders = ", ".join(f":{c}" for c in cols)
        cafe_session.execute(
            text(f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"),
            params,
        )

    cafe_session.commit()
    logger.info("Copied %d rows from %s for cafe %d", len(rows), table, cafe_id)


def main():
    logger.info("=== Primus Database Split Migration ===")
    logger.info("Step 1: Setting up global database...")
    source_engine = get_source_engine()
    global_engine = get_global_engine()
    migrate_global_tables(source_engine, global_engine)

    logger.info("Step 2: Provisioning per-cafe databases...")
    provision_cafe_databases(global_engine)

    logger.info("=== Migration Complete ===")
    source_engine.dispose()
    global_engine.dispose()


if __name__ == "__main__":
    main()
