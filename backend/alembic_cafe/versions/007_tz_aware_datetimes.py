"""Convert naive DateTime columns to TIMESTAMPTZ.

Mixing naive (``TIMESTAMP WITHOUT TIME ZONE``) and aware datetimes is the
single biggest source of off-by-one-day bugs in this codebase — billing
boundaries, session expiries, and audit timestamps are all affected.

This migration converts every business-meaningful DateTime to ``TIMESTAMPTZ``
using ``AT TIME ZONE 'UTC'`` so the existing values are interpreted as UTC
(which matches what ``datetime.utcnow()`` was writing). After this runs:

  - ``client_pcs.last_heartbeat`` etc. are stored with explicit offset
  - reads via SQLAlchemy come back as timezone-aware ``datetime``
  - JSON serialisation includes the ``+00:00`` suffix

Tables touched are listed in ``_DATETIME_COLUMNS`` below. Columns already
declared ``timezone=True`` in the source models are no-ops (the migration
detects current type and skips).

Revision ID: 007_tz_aware_datetimes
Revises: 006_financial_numeric_types
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "007_tz_aware_datetimes"
down_revision = "006_financial_numeric_types"
branch_labels = None
depends_on = None


# (table, column). Order matches the model file in app/db/models_cafe.py.
# DateTime columns already declared timezone=True at table-create time
# (e.g. users.* in 001_cafe_schema) are skipped at runtime by the type check.
_DATETIME_COLUMNS: list[tuple[str, str]] = [
    # core
    ("users", "created_at"),
    ("wallet_transactions", "timestamp"),
    ("sessions", "start_time"),
    ("sessions", "end_time"),
    ("orders", "created_at"),
    ("payment_intents", "created_at"),
    ("payment_intents", "updated_at"),

    # operations
    ("client_pcs", "last_heartbeat"),
    ("audit_logs", "timestamp"),
    ("system_events", "timestamp"),
    ("device_ip_history", "first_seen"),
    ("device_ip_history", "last_seen"),
    ("webhooks", "created_at"),

    # pricing / packages
    ("time_slot_pricing_rules", "created_at"),
    ("time_slot_pricing_rules", "updated_at"),
    ("user_offers", "purchased_at"),
    ("user_memberships", "start_date"),
    ("user_memberships", "end_date"),

    # commerce
    ("orders", "created_at"),
    ("coupons", "expires_at"),
    ("coupon_redemptions", "timestamp"),

    # marketing
    ("campaigns", "start_date"),
    ("campaigns", "end_date"),
    ("campaigns", "created_at"),
    ("campaigns", "updated_at"),

    # communications
    ("chat_messages", "timestamp"),
    ("notifications", "created_at"),
    ("support_tickets", "created_at"),
    ("support_tickets", "updated_at"),
    ("announcements", "created_at"),
    ("announcements", "start_time"),
    ("announcements", "end_time"),

    # remote / commands
    ("remote_commands", "issued_at"),
    ("remote_commands", "expires_at"),
    ("remote_commands", "acknowledged_at"),

    # bookings
    ("bookings", "start_time"),
    ("bookings", "end_time"),
    ("bookings", "created_at"),
    ("squad_bookings", "created_at"),

    # misc
    ("backup_entries", "created_at"),
    ("settings", "updated_at"),
]


def _column_info(conn, table: str, column: str) -> tuple[bool, str | None]:
    """Returns (exists, current data_type)."""
    row = conn.execute(sa.text("""
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
    """), {"t": table, "c": column}).first()
    if row is None:
        return False, None
    return True, row[0]


def upgrade() -> None:
    conn = op.get_bind()
    for table, column in _DATETIME_COLUMNS:
        exists, dtype = _column_info(conn, table, column)
        if not exists:
            # Skip missing columns silently — older cafe DBs may lack them.
            continue
        if dtype == "timestamp with time zone":
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE TIMESTAMPTZ USING {column} AT TIME ZONE 'UTC'"
        ))


def downgrade() -> None:
    # Convert back to TIMESTAMP WITHOUT TIME ZONE. The reverse cast drops
    # the offset but interprets the value as UTC first, preserving the
    # absolute instant for any consumer that re-reads it as UTC.
    conn = op.get_bind()
    for table, column in _DATETIME_COLUMNS:
        exists, dtype = _column_info(conn, table, column)
        if not exists:
            continue
        if dtype != "timestamp with time zone":
            continue
        op.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} "
            f"TYPE TIMESTAMP WITHOUT TIME ZONE "
            f"USING {column} AT TIME ZONE 'UTC'"
        ))
