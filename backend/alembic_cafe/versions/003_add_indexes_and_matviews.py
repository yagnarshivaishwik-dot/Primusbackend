"""Add composite indexes and materialized views for analytics.

Revision ID: 003_add_indexes_and_matviews
Revises: 002_enable_rls
Create Date: 2026-04-06

Adds:
  1. Composite indexes on wallet_transactions, sessions, orders, payment_intents, bookings
  2. Materialized view mv_hourly_revenue for fast analytics queries
  3. Materialized view mv_daily_session_stats for session analytics
"""

from alembic import op

revision = "003_add_indexes_and_matviews"
down_revision = "002_enable_rls"
branch_labels = None
depends_on = None


def upgrade():
    # ── Composite Indexes (CREATE INDEX CONCURRENTLY not available in txn) ──
    # These match the Index() declarations added to models_cafe.py

    op.create_index(
        "ix_wallet_txn_type_timestamp", "wallet_transactions", ["type", "timestamp"]
    )
    op.create_index(
        "ix_wallet_txn_user_timestamp", "wallet_transactions", ["user_id", "timestamp"]
    )
    op.create_index("ix_session_start_time", "sessions", ["start_time"])
    op.create_index("ix_session_user_start", "sessions", ["user_id", "start_time"])
    op.create_index("ix_session_paid_start", "sessions", ["paid", "start_time"])
    op.create_index("ix_order_created", "orders", ["created_at"])
    op.create_index("ix_order_user_created", "orders", ["user_id", "created_at"])
    op.create_index(
        "ix_payment_status_created", "payment_intents", ["status", "created_at"]
    )
    op.create_index(
        "ix_payment_provider_status", "payment_intents", ["provider", "status"]
    )
    op.create_index(
        "ix_booking_pc_times", "bookings", ["pc_id", "start_time", "end_time"]
    )
    op.create_index("ix_booking_status", "bookings", ["status"])

    # ── Materialized View: hourly revenue breakdown ──
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_revenue AS
        SELECT
            date_trunc('hour', timestamp) AS hour,
            type,
            COUNT(*) AS txn_count,
            COALESCE(SUM(amount), 0) AS total_amount
        FROM wallet_transactions
        GROUP BY 1, 2
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_mv_hourly_revenue_pk "
        "ON mv_hourly_revenue (hour, type)"
    )

    # ── Materialized View: daily session stats ──
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_session_stats AS
        SELECT
            date_trunc('day', start_time) AS day,
            COUNT(*) AS session_count,
            COUNT(*) FILTER (WHERE paid = true) AS paid_sessions,
            COALESCE(SUM(amount) FILTER (WHERE paid = true), 0) AS total_revenue,
            COALESCE(AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)
                     FILTER (WHERE end_time IS NOT NULL), 0) AS avg_duration_minutes
        FROM sessions
        GROUP BY 1
    """)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_mv_daily_session_stats_pk "
        "ON mv_daily_session_stats (day)"
    )


def downgrade():
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_daily_session_stats")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_hourly_revenue")

    op.drop_index("ix_booking_status")
    op.drop_index("ix_booking_pc_times")
    op.drop_index("ix_payment_provider_status")
    op.drop_index("ix_payment_status_created")
    op.drop_index("ix_order_user_created")
    op.drop_index("ix_order_created")
    op.drop_index("ix_session_paid_start")
    op.drop_index("ix_session_user_start")
    op.drop_index("ix_session_start_time")
    op.drop_index("ix_wallet_txn_user_timestamp")
    op.drop_index("ix_wallet_txn_type_timestamp")
