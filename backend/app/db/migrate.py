"""
Migration runner for multi-database architecture.

Usage:
    python -m app.db.migrate global upgrade head
    python -m app.db.migrate cafes upgrade head
    python -m app.db.migrate cafe <cafe_id> upgrade head
"""

import os
import sys
import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_global_alembic_config() -> Config:
    """Get Alembic config for global database."""
    cfg = Config(os.path.join(BASE_DIR, "alembic_global.ini"))
    url = os.getenv("GLOBAL_DATABASE_URL", os.getenv("DATABASE_URL", ""))
    if url:
        cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def get_cafe_alembic_config(cafe_db_url: str) -> Config:
    """Get Alembic config for a specific cafe database."""
    cfg = Config(os.path.join(BASE_DIR, "alembic_cafe.ini"))
    cfg.set_main_option("sqlalchemy.url", cafe_db_url)
    return cfg


def migrate_global(action: str, revision: str = "head"):
    """Run migrations on the global database."""
    cfg = get_global_alembic_config()
    if action == "upgrade":
        command.upgrade(cfg, revision)
        logger.info("Global DB upgraded to %s", revision)
    elif action == "downgrade":
        command.downgrade(cfg, revision)
        logger.info("Global DB downgraded to %s", revision)
    else:
        raise ValueError(f"Unknown action: {action}")


def migrate_single_cafe(cafe_id: int, action: str, revision: str = "head"):
    """Run migrations on a single cafe database."""
    from app.db.router import _derive_cafe_url
    url = _derive_cafe_url(cafe_id)
    cfg = get_cafe_alembic_config(url)
    if action == "upgrade":
        command.upgrade(cfg, revision)
        logger.info("Cafe %d DB upgraded to %s", cafe_id, revision)
    elif action == "downgrade":
        command.downgrade(cfg, revision)
        logger.info("Cafe %d DB downgraded to %s", cafe_id, revision)


def migrate_all_cafes(action: str, revision: str = "head"):
    """Run migrations on all cafe databases."""
    global_url = os.getenv("GLOBAL_DATABASE_URL", os.getenv("DATABASE_URL", ""))
    engine = create_engine(global_url, future=True)

    with engine.connect() as conn:
        result = conn.execute(text("SELECT id FROM cafes WHERE db_provisioned = true"))
        cafe_ids = [row[0] for row in result]

    engine.dispose()
    logger.info("Found %d provisioned cafes to migrate", len(cafe_ids))

    errors = []
    for cafe_id in cafe_ids:
        try:
            migrate_single_cafe(cafe_id, action, revision)
        except Exception as e:
            logger.exception("Failed to migrate cafe %d", cafe_id)
            errors.append((cafe_id, str(e)))

    if errors:
        logger.error("Migration errors: %s", errors)
    else:
        logger.info("All %d cafe databases migrated successfully", len(cafe_ids))

    return errors


def main():
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) < 3:
        print("Usage:")
        print("  python -m app.db.migrate global upgrade [revision]")
        print("  python -m app.db.migrate cafes upgrade [revision]")
        print("  python -m app.db.migrate cafe <cafe_id> upgrade [revision]")
        sys.exit(1)

    target = sys.argv[1]
    action = sys.argv[2] if len(sys.argv) > 2 else "upgrade"
    revision = sys.argv[3] if len(sys.argv) > 3 else "head"

    if target == "global":
        migrate_global(action, revision)
    elif target == "cafes":
        errors = migrate_all_cafes(action, revision)
        if errors:
            sys.exit(1)
    elif target == "cafe":
        if len(sys.argv) < 4:
            print("Usage: python -m app.db.migrate cafe <cafe_id> upgrade [revision]")
            sys.exit(1)
        cafe_id = int(sys.argv[2])
        action = sys.argv[3] if len(sys.argv) > 3 else "upgrade"
        revision = sys.argv[4] if len(sys.argv) > 4 else "head"
        migrate_single_cafe(cafe_id, action, revision)
    else:
        print(f"Unknown target: {target}")
        sys.exit(1)


if __name__ == "__main__":
    main()
