"""Add squad_bookings and time_slot_pricing_rules to cafe DBs.

Both tables are defined in ``app/db/models_cafe.py`` but were never
materialised on production per-cafe DBs (they were create_all()-bootstrapped
before the models were added). This migration creates them idempotently.

The tables are NOT cafe_id-scoped in the cafe DBs *except* for
``time_slot_pricing_rules`` (which keeps a denormalised ``cafe_id`` column
for parity with the single-DB legacy table) and ``squad_bookings`` (same
reason — see model docstring).

Revision ID: 005_add_squad_bookings_and_pricing_rules
Revises: 004_add_campaigns
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "005_add_squad_bookings_and_pricing_rules"
down_revision = "004_add_campaigns"
branch_labels = None
depends_on = None


# Detect table existence at runtime so we can no-op + provide a meaningful
# downgrade. The forensic audit found prod DBs where create_all() had
# already materialised one of these tables, so we cannot blindly create.
def _table_exists(conn, table_name: str) -> bool:
    return bool(conn.execute(sa.text(
        "SELECT to_regclass(:t)"
    ), {"t": f"public.{table_name}"}).scalar())


def upgrade() -> None:
    conn = op.get_bind()

    # --- squad_bookings -------------------------------------------------
    if not _table_exists(conn, "squad_bookings"):
        op.create_table(
            "squad_bookings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "captain_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("cafe_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column(
                "payment_split",
                sa.String(),
                nullable=False,
                server_default="captain",
            ),
            sa.Column(
                "total_amount_paise",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
            sa.Column("currency", sa.String(), nullable=False, server_default="INR"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
        )
        op.create_index(
            "ix_squad_bookings_captain_id",
            "squad_bookings",
            ["captain_id"],
        )
        op.create_index(
            "ix_squad_bookings_cafe_id",
            "squad_bookings",
            ["cafe_id"],
        )
        op.create_index(
            "ix_squad_captain_created",
            "squad_bookings",
            ["captain_id", "created_at"],
        )

    # --- time_slot_pricing_rules ---------------------------------------
    if not _table_exists(conn, "time_slot_pricing_rules"):
        op.create_table(
            "time_slot_pricing_rules",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("cafe_id", sa.Integer(), nullable=False),
            sa.Column("day_of_week", sa.SmallInteger(), nullable=True),
            sa.Column("start_minute", sa.Integer(), nullable=False),
            sa.Column("end_minute", sa.Integer(), nullable=False),
            sa.Column("price_per_hour_paise", sa.Integer(), nullable=False),
            sa.Column("pc_class", sa.String(), nullable=True),
            sa.Column("currency", sa.String(), nullable=False, server_default="INR"),
            sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("NOW()"),
            ),
            sa.CheckConstraint(
                "start_minute >= 0 AND start_minute < 1440",
                name="ck_tspr_start_minute",
            ),
            sa.CheckConstraint(
                "end_minute > 0 AND end_minute <= 1440",
                name="ck_tspr_end_minute",
            ),
            sa.CheckConstraint(
                "end_minute > start_minute",
                name="ck_tspr_window",
            ),
            sa.CheckConstraint(
                "day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)",
                name="ck_tspr_day_of_week",
            ),
        )
        op.create_index("ix_tspr_cafe_id", "time_slot_pricing_rules", ["cafe_id"])
        op.create_index(
            "ix_tspr_cafe_dow",
            "time_slot_pricing_rules",
            ["cafe_id", "day_of_week"],
        )


def downgrade() -> None:
    # Drop only if present — protects against partial-upgrade scenarios.
    conn = op.get_bind()
    if _table_exists(conn, "time_slot_pricing_rules"):
        op.drop_table("time_slot_pricing_rules")
    if _table_exists(conn, "squad_bookings"):
        op.drop_table("squad_bookings")
