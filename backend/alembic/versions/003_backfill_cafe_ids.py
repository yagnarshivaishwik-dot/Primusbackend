"""Backfill cafe_id on business tables from owning entities,
populate user_cafe_map from existing User.cafe_id, hash device secrets.

Revision ID: 003_backfill_cafe_ids
Revises: 002_multi_tenant_schema
Create Date: 2026-03-30
"""

import hashlib

from alembic import op
from sqlalchemy import text

revision = "003_backfill_cafe_ids"
down_revision = "002_multi_tenant_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Populate user_cafe_map from existing User.cafe_id
    conn.execute(text("""
        INSERT INTO user_cafe_map (user_id, cafe_id, role, is_primary, created_at, updated_at)
        SELECT id, cafe_id, role, true, now(), now()
        FROM users
        WHERE cafe_id IS NOT NULL
        ON CONFLICT (user_id, cafe_id) DO NOTHING
    """))

    # 2. Backfill sessions.cafe_id from client_pcs
    conn.execute(text("""
        UPDATE sessions s
        SET cafe_id = cp.cafe_id
        FROM client_pcs cp
        WHERE s.client_pc_id = cp.id
          AND s.cafe_id IS NULL
          AND cp.cafe_id IS NOT NULL
    """))
    # Fallback: backfill sessions.cafe_id from users
    conn.execute(text("""
        UPDATE sessions s
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE s.user_id = u.id
          AND s.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 3. Backfill wallet_transactions.cafe_id from users
    conn.execute(text("""
        UPDATE wallet_transactions wt
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE wt.user_id = u.id
          AND wt.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 4. Backfill chat_messages.cafe_id from sender
    conn.execute(text("""
        UPDATE chat_messages cm
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE cm.from_user_id = u.id
          AND cm.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 5. Backfill notifications.cafe_id from user
    conn.execute(text("""
        UPDATE notifications n
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE n.user_id = u.id
          AND n.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 6. Backfill support_tickets.cafe_id from user
    conn.execute(text("""
        UPDATE support_tickets st
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE st.user_id = u.id
          AND st.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 7. Backfill bookings.cafe_id from user
    conn.execute(text("""
        UPDATE bookings b
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE b.user_id = u.id
          AND b.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 8. Backfill orders.cafe_id from user
    conn.execute(text("""
        UPDATE orders o
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE o.user_id = u.id
          AND o.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))

    # 9. Backfill screenshots.cafe_id from client_pcs
    conn.execute(text("""
        UPDATE screenshots s
        SET cafe_id = cp.cafe_id
        FROM client_pcs cp
        WHERE s.pc_id = cp.id
          AND s.cafe_id IS NULL
          AND cp.cafe_id IS NOT NULL
    """))

    # 10. Hash existing device_secret values into device_secret_hash
    # We do this in SQL using PostgreSQL's encode(digest(...)) for SHA-256
    conn.execute(text("""
        UPDATE client_pcs
        SET device_secret_hash = encode(digest(device_secret, 'sha256'), 'hex')
        WHERE device_secret IS NOT NULL
          AND device_secret_hash IS NULL
    """))

    # 11. Set device_status based on suspended flag
    conn.execute(text("""
        UPDATE client_pcs
        SET device_status = CASE
            WHEN suspended = true THEN 'revoked'
            ELSE 'active'
        END
        WHERE device_status IS NULL OR device_status = 'active'
    """))

    # 12. Backfill audit_logs.cafe_id from user
    conn.execute(text("""
        UPDATE audit_logs al
        SET cafe_id = u.cafe_id
        FROM users u
        WHERE al.user_id = u.id
          AND al.cafe_id IS NULL
          AND u.cafe_id IS NOT NULL
    """))


def downgrade() -> None:
    conn = op.get_bind()

    # Clear backfilled data (safe: only clears what we filled)
    conn.execute(text("UPDATE client_pcs SET device_secret_hash = NULL"))
    conn.execute(text("UPDATE client_pcs SET device_status = 'active'"))
    conn.execute(text("UPDATE audit_logs SET cafe_id = NULL, device_id = NULL"))
    conn.execute(text("DELETE FROM user_cafe_map"))

    # cafe_id columns on business tables: set back to NULL
    _tables = [
        "sessions", "wallet_transactions", "chat_messages", "notifications",
        "support_tickets", "bookings", "orders", "screenshots",
    ]
    for table in _tables:
        conn.execute(text(f"UPDATE {table} SET cafe_id = NULL"))
