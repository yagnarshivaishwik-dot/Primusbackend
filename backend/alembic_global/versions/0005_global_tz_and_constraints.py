"""Tighten constraints + tz-awareness on the global DB.

Two integrity fixes:

  1. ``users.wallet_balance`` previously had no non-negative check at the
     global-DB level. The cafe DB copy *does* (see 001_cafe_schema), but
     legacy migration 002_multi_tenant_schema dropped the global one.
     Re-adds ``CHECK (wallet_balance >= 0)``.
  2. Convert business-meaningful ``TIMESTAMP WITHOUT TIME ZONE`` columns
     (created/updated/started/ended) to ``TIMESTAMPTZ`` using ``AT TIME ZONE
     'UTC'`` so multi-region reads stop losing offset info. Mirrors the
     cafe-DB migration ``007_tz_aware_datetimes``.

Revision ID: 0005_global_tz_and_constraints
Revises: 0004_audit_append_only
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "0005_global_tz_and_constraints"
down_revision = "0004_audit_append_only"
branch_labels = None
depends_on = None


# (table, column). All are timestamps that should be tz-aware.
_DATETIME_COLUMNS: list[tuple[str, str]] = [
    ("users", "birthdate"),
    ("users", "tos_accepted_at"),
    ("users", "email_verification_sent_at"),
    ("users", "profile_picture_updated_at"),
    ("user_cafe_map", "created_at"),
    ("user_cafe_map", "updated_at"),
    ("refresh_tokens", "created_at"),
    ("refresh_tokens", "expires_at"),
    ("refresh_tokens", "revoked_at"),
    ("subscriptions", "current_period_start"),
    ("subscriptions", "current_period_end"),
    ("subscriptions", "trial_ends_at"),
    ("subscriptions", "cancelled_at"),
    ("subscriptions", "created_at"),
    ("subscriptions", "updated_at"),
    ("invoices", "due_date"),
    ("invoices", "paid_at"),
    ("invoices", "created_at"),
    ("platform_financial_audit", "created_at"),
]


def _column_info(conn, table: str, column: str) -> tuple[bool, str | None]:
    row = conn.execute(sa.text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).first()
    if row is None:
        return False, None
    return True, row[0]


def _constraint_exists(conn, table: str, name: str) -> bool:
    return bool(conn.execute(sa.text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = :t
          AND constraint_name = :n
    """), {"t": table, "n": name}).scalar())


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Non-negative wallet balance check.
    if not _constraint_exists(conn, "users", "ck_users_wallet_balance_nonneg"):
        # Repair any negative balances first to avoid migration failure.
        conn.execute(sa.text(
            "UPDATE users SET wallet_balance = 0 WHERE wallet_balance < 0"
        ))
        op.execute(sa.text(
            "ALTER TABLE users "
            "ADD CONSTRAINT ck_users_wallet_balance_nonneg "
            "CHECK (wallet_balance >= 0)"
        ))

    # 2. Timezone-aware datetimes.
    for table, column in _DATETIME_COLUMNS:
        exists, dtype = _column_info(conn, table, column)
        if not exists:
            continue
        if dtype == "timestamp with time zone":
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE TIMESTAMPTZ USING {column} AT TIME ZONE 'UTC'"
        ))


def downgrade() -> None:
    conn = op.get_bind()

    for table, column in _DATETIME_COLUMNS:
        exists, dtype = _column_info(conn, table, column)
        if not exists or dtype != "timestamp with time zone":
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE TIMESTAMP WITHOUT TIME ZONE "
            f"USING {column} AT TIME ZONE 'UTC'"
        ))

    if _constraint_exists(conn, "users", "ck_users_wallet_balance_nonneg"):
        op.execute(sa.text(
            "ALTER TABLE users DROP CONSTRAINT ck_users_wallet_balance_nonneg"
        ))
