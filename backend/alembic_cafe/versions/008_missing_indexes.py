"""Add missing hot-path indexes on cafe DBs.

Slow-query log analysis (collected 2026-05-22) flagged the following
sequential scans as the top latency offenders for cafes >5k users:

  - sessions(pc_id)             — admin "PC history" page
  - chat_messages(to_user_id)   — unread badge query
  - chat_messages(from_user_id) — outbox pagination
  - offers(name) WHERE active   — kiosk shop dedupe
  - user_offers(user_id)        — wallet recalc
  - order_items(order_id)       — admin order detail
  - bookings(user_id)           — user history
  - remote_commands(pc_id, state) WHERE PENDING — agent poll
  - audit_logs(user_id, timestamp DESC) — admin audit view
  - time_slot_pricing_rules(cafe_id, active) WHERE active — pricing lookup

Indexes are created **CONCURRENTLY** so they don't block writes on
production. This requires running outside a transaction — Alembic uses
``transactional = False`` (or equivalently, the migration runs each
``CREATE INDEX`` in its own autocommit connection).

Revision ID: 008_missing_indexes
Revises: 007_tz_aware_datetimes
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "008_missing_indexes"
down_revision = "007_tz_aware_datetimes"
branch_labels = None
depends_on = None

# CRITICAL: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
# Tell Alembic to commit before/around each statement.
transactional = False


_INDEX_STATEMENTS: list[tuple[str, str]] = [
    (
        "ix_sessions_pc_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sessions_pc_id "
        "ON sessions (pc_id)",
    ),
    (
        "ix_chat_msg_to_ts",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chat_msg_to_ts "
        "ON chat_messages (to_user_id, timestamp DESC) "
        "WHERE to_user_id IS NOT NULL",
    ),
    (
        "ix_chat_msg_from_ts",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_chat_msg_from_ts "
        "ON chat_messages (from_user_id, timestamp DESC)",
    ),
    (
        "uq_offers_name_active",
        "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_offers_name_active "
        "ON offers (name) WHERE active = TRUE",
    ),
    (
        "ix_user_offers_user_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_user_offers_user_id "
        "ON user_offers (user_id)",
    ),
    (
        "ix_order_items_order_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_order_items_order_id "
        "ON order_items (order_id)",
    ),
    (
        "ix_bookings_user_id",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_bookings_user_id "
        "ON bookings (user_id)",
    ),
    (
        "ix_remote_cmd_pc_state",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_remote_cmd_pc_state "
        "ON remote_commands (pc_id, state) WHERE state = 'PENDING'",
    ),
    (
        "ix_audit_logs_user_ts",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_audit_logs_user_ts "
        "ON audit_logs (user_id, timestamp DESC)",
    ),
    (
        "ix_tspr_cafe_active",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_tspr_cafe_active "
        "ON time_slot_pricing_rules (cafe_id, active) WHERE active = TRUE",
    ),
]


def upgrade() -> None:
    # Get the raw DB-API connection so we can run each CREATE INDEX
    # CONCURRENTLY outside a transaction. SQLAlchemy's begin() would
    # implicitly start one and Postgres would refuse.
    bind = op.get_bind()
    raw = bind.engine.raw_connection()
    try:
        raw.autocommit = True
        cur = raw.cursor()
        for name, stmt in _INDEX_STATEMENTS:
            try:
                cur.execute(stmt)
            except Exception as exc:  # pragma: no cover - operational
                # CONCURRENTLY can leave an INVALID index behind on
                # failure; log and continue so other indexes get built.
                print(f"[008_missing_indexes] {name} failed: {exc}")
        cur.close()
    finally:
        raw.close()


def downgrade() -> None:
    bind = op.get_bind()
    raw = bind.engine.raw_connection()
    try:
        raw.autocommit = True
        cur = raw.cursor()
        for name, _stmt in reversed(_INDEX_STATEMENTS):
            try:
                cur.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
            except Exception as exc:  # pragma: no cover
                print(f"[008_missing_indexes] drop {name} failed: {exc}")
        cur.close()
    finally:
        raw.close()
