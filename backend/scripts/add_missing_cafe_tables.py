"""Add the two missing cafe tables (and the bookings.squad_booking_id column)
to every per-cafe database.

Why this isn't an Alembic migration:
  Per-cafe DBs on prod have NO `alembic_version` table — they were bootstrapped
  via SQLAlchemy `metadata.create_all()` at provisioning time and never tracked
  by Alembic since. Writing an alembic_cafe migration is the *correct*
  long-term fix but requires retrofitting alembic_version onto all cafe DBs
  first, which is a larger architectural change (see TECH_DEBT.md item #13).
  This standalone script is the pragmatic fix that ships the schema change now.

What it does (idempotent — safe to re-run, safe to crash partway):
  For each target DB:
    1. CREATE TABLE IF NOT EXISTS squad_bookings
    2. CREATE TABLE IF NOT EXISTS time_slot_pricing_rules
    3. ALTER TABLE bookings ADD COLUMN squad_booking_id INTEGER (if missing)
    4. ADD FOREIGN KEY constraint bookings.squad_booking_id -> squad_bookings.id (if missing)
    5. CREATE INDEX IF NOT EXISTS ix_booking_squad

Targets (auto-discovered):
  - All databases matching `clutchhh_cafe_%` (active cafe DBs)
  - `clutchhh_db` (template, so future cafe provisions inherit the new tables)
  - `primus_cafe_1` (legacy, schema-identical to active cafe DBs)

Usage on local (single cafe DB):
  docker exec -e PYTHONPATH=/app -e GLOBAL_DATABASE_URL=$GLOBAL_DATABASE_URL \\
      clutchhh_backend python /app/scripts/add_missing_cafe_tables.py

Usage on prod (16 cafe DBs + template + legacy = 18 DBs):
  Same command on the prod host, after backup + with prod env vars.

Flags:
  --dry-run   Print what would happen per DB, don't actually run anything.
  --no-legacy Skip primus_cafe_1.
  --no-template Skip clutchhh_db.
"""

import argparse
import os
import sys

import psycopg2
from psycopg2 import errors as psy_errors


# Idempotent DDL — each block tolerates being applied against a partially-fixed DB.
DDL_STATEMENTS = [
    # 1. squad_bookings table
    """
    CREATE TABLE IF NOT EXISTS squad_bookings (
        id SERIAL NOT NULL,
        captain_id INTEGER NOT NULL,
        cafe_id INTEGER NOT NULL,
        status VARCHAR NOT NULL,
        payment_split VARCHAR NOT NULL,
        total_amount_paise INTEGER NOT NULL,
        currency VARCHAR NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(captain_id) REFERENCES users (id)
    )
    """,
    # 2. time_slot_pricing_rules table
    """
    CREATE TABLE IF NOT EXISTS time_slot_pricing_rules (
        id SERIAL NOT NULL,
        cafe_id INTEGER NOT NULL,
        day_of_week SMALLINT,
        start_minute INTEGER NOT NULL,
        end_minute INTEGER NOT NULL,
        price_per_hour_paise INTEGER NOT NULL,
        pc_class VARCHAR,
        currency VARCHAR NOT NULL,
        priority INTEGER NOT NULL,
        active BOOLEAN NOT NULL,
        created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT ck_tspr_start_minute CHECK (start_minute >= 0 AND start_minute < 1440),
        CONSTRAINT ck_tspr_end_minute CHECK (end_minute > 0 AND end_minute <= 1440),
        CONSTRAINT ck_tspr_window CHECK (end_minute > start_minute),
        CONSTRAINT ck_tspr_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6))
    )
    """,
    # 3. bookings.squad_booking_id column. PostgreSQL 9.6+ supports IF NOT EXISTS.
    """
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS squad_booking_id INTEGER
    """,
    # 4. FK constraint. There's no ADD CONSTRAINT IF NOT EXISTS — wrap in a DO block.
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'bookings_squad_booking_id_fkey'
              AND conrelid = 'bookings'::regclass
        ) THEN
            ALTER TABLE bookings
                ADD CONSTRAINT bookings_squad_booking_id_fkey
                FOREIGN KEY (squad_booking_id) REFERENCES squad_bookings(id);
        END IF;
    END$$
    """,
    # 5. Index on squad_booking_id (matches the SQLAlchemy model's Index declaration).
    """
    CREATE INDEX IF NOT EXISTS ix_booking_squad ON bookings (squad_booking_id)
    """,
]


def admin_url() -> str:
    """Connection string for the postgres maintenance DB (used to enumerate DBs)."""
    u = os.environ["GLOBAL_DATABASE_URL"]
    u = u.replace("/clutchhh_global", "/postgres")
    return u.replace("postgresql+psycopg2://", "postgresql://", 1)


def db_url(name: str) -> str:
    """Connection string for an arbitrary database on the same server."""
    u = os.environ["GLOBAL_DATABASE_URL"]
    u = u.replace("/clutchhh_global", f"/{name}")
    return u.replace("postgresql+psycopg2://", "postgresql://", 1)


def discover_cafe_dbs() -> list[str]:
    """Return all databases matching 'clutchhh_cafe_%' on this server."""
    conn = psycopg2.connect(admin_url())
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT datname FROM pg_database "
            "WHERE datname LIKE 'clutchhh_cafe_%' ORDER BY datname"
        )
        return [row[0] for row in cur.fetchall()]
    finally:
        conn.close()


def apply_to_db(db_name: str, dry_run: bool) -> tuple[bool, str]:
    """Apply the migration to one DB. Returns (success, message)."""
    try:
        conn = psycopg2.connect(db_url(db_name))
    except psy_errors.OperationalError as e:
        return False, f"connection failed: {e}"

    try:
        if dry_run:
            return True, "would apply 5 DDL statements (dry-run, no change)"

        cur = conn.cursor()
        for stmt in DDL_STATEMENTS:
            cur.execute(stmt)
        conn.commit()
        return True, "ok"
    except Exception as e:
        conn.rollback()
        return False, f"error: {e}"
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would happen, don't change anything")
    parser.add_argument("--no-legacy", action="store_true",
                        help="Skip primus_cafe_1")
    parser.add_argument("--no-template", action="store_true",
                        help="Skip clutchhh_db (template)")
    args = parser.parse_args()

    if "GLOBAL_DATABASE_URL" not in os.environ:
        print("ERROR: GLOBAL_DATABASE_URL env var not set", file=sys.stderr)
        return 1

    cafe_dbs = discover_cafe_dbs()
    targets = list(cafe_dbs)

    if not args.no_template:
        targets.append("clutchhh_db")
    if not args.no_legacy:
        targets.append("primus_cafe_1")

    if not targets:
        print("No target databases found. Is this server set up?", file=sys.stderr)
        return 1

    mode = "DRY-RUN" if args.dry_run else "APPLY"
    print(f"=== {mode} === target databases ({len(targets)}):")
    for db in targets:
        print(f"  - {db}")
    print()

    successes = 0
    failures = []
    for db in targets:
        ok, msg = apply_to_db(db, dry_run=args.dry_run)
        marker = "ok" if ok else "FAIL"
        print(f"  [{marker}] {db}: {msg}")
        if ok:
            successes += 1
        else:
            failures.append(db)

    print()
    print(f"Summary: {successes}/{len(targets)} succeeded")
    if failures:
        print(f"Failed: {', '.join(failures)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
