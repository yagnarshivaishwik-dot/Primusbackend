"""
One-shot schema patcher for the Offer Inventory v2 columns.

Idempotent — safe to run any number of times. Patches both the global
DB (where single-DB-mode offers live) AND every per-cafe DB the global
`cafes` table knows about.

Usage:
    docker compose exec -T backend python -m scripts.patch_offer_inventory_v2

Or, if you prefer to run from the host with a shell pipe:
    docker compose exec -T backend python /app/scripts/patch_offer_inventory_v2.py

Exits with non-zero only if the global DB couldn't be reached at all.
Per-cafe failures are logged but don't fail the script — a single
detached cafe DB shouldn't block fixing the rest of the fleet.
"""
from __future__ import annotations

import logging
import os
import sys
from typing import Iterable


DDL_STATEMENTS: tuple[str, ...] = (
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS tax_percent DOUBLE PRECISION NOT NULL DEFAULT 0",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS is_happy_hour_only BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS happy_hour_start VARCHAR(5)",
    "ALTER TABLE offers ADD COLUMN IF NOT EXISTS happy_hour_end VARCHAR(5)",
    "CREATE INDEX IF NOT EXISTS ix_offers_display_order ON offers (display_order)",
)


def _setup_logging() -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(levelname)s] %(message)s",
    )
    return logging.getLogger("patch_offer_inventory_v2")


def _patch_engine(engine, label: str, log: logging.Logger) -> int:
    """Run each DDL in its own transaction. Returns # of failures."""
    from sqlalchemy import text

    failures = 0
    for stmt in DDL_STATEMENTS:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as exc:
            failures += 1
            log.warning("[%s] skipped: %s -- %s", label, stmt, exc)
    if failures == 0:
        log.info("[%s] all %d statements applied", label, len(DDL_STATEMENTS))
    else:
        log.info(
            "[%s] %d/%d statements applied (%d skipped — likely already present)",
            label, len(DDL_STATEMENTS) - failures, len(DDL_STATEMENTS), failures,
        )
    return failures


def _enumerate_cafe_ids(global_engine, log: logging.Logger) -> Iterable[int]:
    from sqlalchemy import text
    try:
        with global_engine.connect() as conn:
            rows = conn.execute(text("SELECT id FROM cafes")).all()
        ids = [int(r[0]) for r in rows]
        log.info("found %d cafe(s) in global DB: %s", len(ids), ids)
        return ids
    except Exception as exc:
        log.warning("could not enumerate cafes from global DB: %s", exc)
        return ()


def main() -> int:
    log = _setup_logging()

    # Bring the app's DB modules into scope. We rely on the same env vars
    # the running backend uses (DATABASE_URL etc.) so this script Just
    # Works inside `docker compose exec -T backend`.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    try:
        from app.db.global_db import global_engine
    except Exception as exc:
        log.error("could not import app.db.global_db: %s", exc)
        return 2

    log.info("=== global DB ===")
    _patch_engine(global_engine, "global", log)

    try:
        multi_db = os.getenv("MULTI_DB_ENABLED", "false").lower() == "true"
    except Exception:
        multi_db = False

    if not multi_db:
        log.info("MULTI_DB_ENABLED=false — single-DB mode, nothing else to patch")
        return 0

    try:
        from app.db.router import cafe_db_router
    except Exception as exc:
        log.error("could not import cafe_db_router: %s", exc)
        return 0  # global already patched, that's still useful

    log.info("=== per-cafe DBs ===")
    for cid in _enumerate_cafe_ids(global_engine, log):
        try:
            engine = cafe_db_router.get_engine(cid)
        except Exception as exc:
            log.warning("cafe %s: get_engine failed: %s", cid, exc)
            continue
        log.info("--- cafe %s ---", cid)
        _patch_engine(engine, f"cafe-{cid}", log)

    log.info("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
