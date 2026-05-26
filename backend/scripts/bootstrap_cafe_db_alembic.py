"""Bootstrap and migrate every per-cafe DB to alembic head.

Production per-cafe DBs were originally created with SQLAlchemy
``metadata.create_all()``, which bypasses alembic. As a result, none of
them have an ``alembic_version`` table — so ``alembic upgrade head`` would
try to apply every revision from the start, hitting "table already exists"
errors immediately.

This one-shot script fixes that for the whole fleet:

  1. Enumerate cafe ids from the global ``cafes`` table.
  2. For each cafe DB, in order:
       - if ``alembic_version`` is missing, ``alembic stamp head`` it first
         (declares "schema is already at head" without running anything).
       - run ``alembic upgrade head`` to apply any *new* migrations
         (e.g. 005 through 009 added 2026-05-25).
  3. Print a per-cafe summary at the end.

Idempotent: safe to re-run any number of times. The script does NOT
modify the global DB — run ``alembic -c alembic_global.ini upgrade head``
separately for that.

Usage (inside the backend container):
    docker compose exec -T backend python -m scripts.bootstrap_cafe_db_alembic

    # Dry-run (enumerate cafes + print plan, no DB writes):
    docker compose exec -T backend \\
        python -m scripts.bootstrap_cafe_db_alembic --dry-run

    # Only one cafe (handy for incident response):
    docker compose exec -T backend \\
        python -m scripts.bootstrap_cafe_db_alembic --cafe-id 42

Exit codes:
  0 — all cafe DBs migrated successfully
  1 — at least one cafe DB failed (others may have succeeded)
  2 — global DB unreachable / no cafe rows found
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class CafeMigrationResult:
    cafe_id: int
    db_name: str
    was_stamped: bool
    migrations_applied: int
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None


def _setup_logging(verbose: bool) -> logging.Logger:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="[%(levelname)s] %(message)s",
    )
    return logging.getLogger("bootstrap_cafe_db_alembic")


def _enumerate_cafe_ids(global_engine, log: logging.Logger) -> list[int]:
    from sqlalchemy import text
    with global_engine.connect() as conn:
        rows = conn.execute(text("SELECT id FROM cafes ORDER BY id")).all()
    ids = [int(r[0]) for r in rows]
    log.info("found %d cafe(s) in global DB", len(ids))
    return ids


def _has_alembic_version(engine) -> bool:
    from sqlalchemy import text
    with engine.connect() as conn:
        return bool(conn.execute(text(
            "SELECT to_regclass('public.alembic_version')"
        )).scalar())


def _current_revision(engine) -> str | None:
    from sqlalchemy import text
    if not _has_alembic_version(engine):
        return None
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT version_num FROM alembic_version LIMIT 1")
        ).scalar()


def _run_alembic(
    db_url: str,
    command_name: str,
    log: logging.Logger,
) -> None:
    """Run alembic command against ``db_url`` using the alembic_cafe.ini config."""
    from alembic import command
    from alembic.config import Config

    cfg_path = os.getenv(
        "ALEMBIC_CAFE_CONFIG",
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "alembic_cafe.ini",
        ),
    )
    cfg = Config(cfg_path)
    cfg.set_main_option("sqlalchemy.url", db_url)
    # The env.py reads CAFE_DATABASE_URL too — set both for safety.
    os.environ["CAFE_DATABASE_URL"] = db_url

    log.debug("alembic %s on %s", command_name, db_url.rsplit("/", 1)[-1])
    if command_name == "stamp":
        command.stamp(cfg, "head")
    elif command_name == "upgrade":
        command.upgrade(cfg, "head")
    else:
        raise ValueError(f"unknown alembic command: {command_name}")


def _migrate_one(
    cafe_id: int,
    log: logging.Logger,
    dry_run: bool,
) -> CafeMigrationResult:
    from app.db.router import derive_cafe_db_name, cafe_db_router

    db_name = derive_cafe_db_name(cafe_id)
    engine = cafe_db_router.get_engine(cafe_id)

    has_version = _has_alembic_version(engine)
    current = _current_revision(engine)

    log.info(
        "cafe %d (%s): alembic_version=%s, current_rev=%s",
        cafe_id, db_name, "present" if has_version else "MISSING", current or "-",
    )

    if dry_run:
        return CafeMigrationResult(
            cafe_id=cafe_id,
            db_name=db_name,
            was_stamped=False,
            migrations_applied=0,
        )

    # Build the DSN for this cafe.
    from app.db.router import _derive_cafe_url
    db_url = _derive_cafe_url(cafe_id)

    was_stamped = False
    try:
        if not has_version:
            # First-time bootstrap: declare current schema == head so the
            # follow-up upgrade only applies *new* migrations.
            _run_alembic(db_url, "stamp", log)
            was_stamped = True
        _run_alembic(db_url, "upgrade", log)
    except Exception as exc:
        log.exception("cafe %d failed", cafe_id)
        return CafeMigrationResult(
            cafe_id=cafe_id,
            db_name=db_name,
            was_stamped=was_stamped,
            migrations_applied=0,
            error=str(exc),
        )

    new_rev = _current_revision(engine)
    log.info("cafe %d (%s): migrated to %s", cafe_id, db_name, new_rev)
    return CafeMigrationResult(
        cafe_id=cafe_id,
        db_name=db_name,
        was_stamped=was_stamped,
        # We don't count applied steps exactly; mark 1 when revision changed.
        migrations_applied=1 if new_rev != current else 0,
    )


def _print_summary(results: list[CafeMigrationResult], log: logging.Logger) -> None:
    ok = [r for r in results if r.ok]
    failed = [r for r in results if not r.ok]
    stamped = [r for r in ok if r.was_stamped]

    log.info("=" * 60)
    log.info("Bootstrap summary")
    log.info("  Total cafes processed: %d", len(results))
    log.info("  Successful:            %d", len(ok))
    log.info("  Stamped (first-time):  %d", len(stamped))
    log.info("  Failed:                %d", len(failed))
    if failed:
        log.info("Failed cafes:")
        for r in failed:
            log.info("  - cafe %d (%s): %s", r.cafe_id, r.db_name, r.error)


def _resolve_targets(arg_cafe_id: int | None, log: logging.Logger) -> Iterable[int]:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    try:
        from app.db.global_db import global_engine
    except Exception as exc:
        log.error("could not import app.db.global_db: %s", exc)
        sys.exit(2)

    if arg_cafe_id is not None:
        return [arg_cafe_id]

    try:
        ids = _enumerate_cafe_ids(global_engine, log)
    except Exception as exc:
        log.error("could not enumerate cafes from global DB: %s", exc)
        sys.exit(2)

    if not ids:
        log.warning("no cafes registered in global DB; nothing to do")
        sys.exit(2)
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cafe-id",
        type=int,
        default=None,
        help="Bootstrap a single cafe DB instead of all of them.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Enumerate + report current revisions; do not run alembic.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    log = _setup_logging(args.verbose)

    targets = list(_resolve_targets(args.cafe_id, log))
    log.info("targets: %s (dry_run=%s)", targets, args.dry_run)

    results: list[CafeMigrationResult] = []
    for cid in targets:
        try:
            results.append(_migrate_one(cid, log, args.dry_run))
        except Exception as exc:
            log.exception("cafe %d: unexpected error", cid)
            results.append(CafeMigrationResult(
                cafe_id=cid,
                db_name=f"cafe-{cid}",
                was_stamped=False,
                migrations_applied=0,
                error=str(exc),
            ))

    _print_summary(results, log)
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
