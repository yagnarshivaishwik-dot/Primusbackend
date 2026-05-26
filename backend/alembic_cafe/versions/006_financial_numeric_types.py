"""Convert money & percentage columns from Float to Numeric.

PostgreSQL ``DOUBLE PRECISION`` (Python ``Float``) is **not** suitable for
money or percentages — it introduces silent rounding errors that accumulate
in wallet ledgers and tax calculations.

This migration switches every money / percentage column to ``NUMERIC`` with
explicit precision and scale:

  - money:        ``NUMERIC(12, 2)``  (max 9_999_999_999.99 INR — well above any
                                       single cafe's biggest transaction)
  - percentages:  ``NUMERIC(5, 2)``   (0.00 – 999.99 — supports e.g. 12.50%)

The conversion uses ``ALTER COLUMN ... TYPE NUMERIC(...) USING ...::numeric``
so no rows are lost. The cast is value-preserving as long as the source
column contains finite floats.

Revision ID: 006_financial_numeric_types
Revises: 005_add_squad_bookings_and_pricing_rules
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "006_financial_numeric_types"
down_revision = "005_add_squad_bookings_and_pricing_rules"
branch_labels = None
depends_on = None


# (table, column, target_type, original_type)
# original_type is recorded for downgrade.
_CONVERSIONS: list[tuple[str, str, str, str]] = [
    ("offers", "price", "NUMERIC(12, 2)", "DOUBLE PRECISION"),
    ("offers", "discount_percent", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("offers", "tax_percent", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("user_groups", "discount_percent", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("user_groups", "coin_multiplier", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("campaigns", "discount_percent", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("coupons", "discount_percent", "NUMERIC(5, 2)", "DOUBLE PRECISION"),
    ("wallet_transactions", "amount", "NUMERIC(12, 2)", "DOUBLE PRECISION"),
    ("sessions", "amount", "NUMERIC(12, 2)", "DOUBLE PRECISION"),
]


def _column_exists(conn, table: str, column: str) -> bool:
    return bool(conn.execute(sa.text("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :t
          AND column_name = :c
    """), {"t": table, "c": column}).scalar())


def _column_type(conn, table: str, column: str) -> str | None:
    row = conn.execute(sa.text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).scalar()
    return row


def upgrade() -> None:
    conn = op.get_bind()
    for table, column, target, _original in _CONVERSIONS:
        if not _column_exists(conn, table, column):
            # Column not yet present (e.g. a partial cafe DB). Skip — the
            # next migration that creates it will already use NUMERIC.
            continue
        current_type = (_column_type(conn, table, column) or "").lower()
        # Already converted — skip to keep the migration idempotent on
        # cafe DBs where 001_cafe_schema already used Numeric.
        if current_type == "numeric":
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {target} "
            f"USING {column}::numeric"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    for table, column, _target, original in _CONVERSIONS:
        if not _column_exists(conn, table, column):
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {original} "
            f"USING {column}::{original.lower()}"
        ))
