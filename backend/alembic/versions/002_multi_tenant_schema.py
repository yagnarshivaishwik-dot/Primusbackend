"""Add multi-tenant schema: user_cafe_map, refresh_tokens, device_ip_history,
cafe_id columns on 23+ tables, device security columns on client_pcs.

Revision ID: 002_multi_tenant_schema
Revises: 001_add_indexes
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op

revision = "002_multi_tenant_schema"
down_revision = "001_add_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- New tables ----

    op.create_table(
        "user_cafe_map",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=False),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("is_primary", sa.Boolean, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "cafe_id", name="uq_user_cafe"),
    )
    op.create_index("ix_user_cafe_map_user_id", "user_cafe_map", ["user_id"])
    op.create_index("ix_user_cafe_map_cafe_id", "user_cafe_map", ["cafe_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String, nullable=False, unique=True),
        sa.Column("device_id", sa.String, nullable=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=True),
        sa.Column("issued_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("revoked", sa.Boolean, server_default=sa.text("false")),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
        sa.Column("ip_address", sa.String, nullable=True),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)

    op.create_table(
        "device_ip_history",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("client_pc_id", sa.Integer, sa.ForeignKey("client_pcs.id"), nullable=False),
        sa.Column("ip_address", sa.String, nullable=False),
        sa.Column("first_seen", sa.DateTime, server_default=sa.func.now()),
        sa.Column("last_seen", sa.DateTime, server_default=sa.func.now()),
        sa.Column("request_count", sa.Integer, server_default=sa.text("1")),
    )
    op.create_index("ix_device_ip_history_client_pc_id", "device_ip_history", ["client_pc_id"])

    # ---- Alter client_pcs: add security columns ----

    op.add_column("client_pcs", sa.Column("device_secret_hash", sa.String, nullable=True))
    op.add_column(
        "client_pcs",
        sa.Column("device_status", sa.String, server_default=sa.text("'active'"), nullable=True),
    )
    op.add_column("client_pcs", sa.Column("allowed_ip_range", sa.String, nullable=True))

    # ---- Alter audit_logs: add tenant + device columns ----

    op.add_column(
        "audit_logs",
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=True),
    )
    op.add_column("audit_logs", sa.Column("device_id", sa.String, nullable=True))
    op.create_index("ix_audit_logs_cafe_id", "audit_logs", ["cafe_id"])

    # ---- Add cafe_id to business tables ----

    _tables_needing_cafe_id = [
        "sessions",
        "wallet_transactions",
        "games",
        "chat_messages",
        "notifications",
        "support_tickets",
        "announcements",
        "hardware_stats",
        "pricing_rules",
        "offers",
        "webhooks",
        "bookings",
        "screenshots",
        "product_categories",
        "products",
        "orders",
        "prizes",
        "leaderboards",
        "events",
        "coupons",
        "membership_packages",
        "user_groups",
        "settings",
    ]

    for table in _tables_needing_cafe_id:
        op.add_column(
            table,
            sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=True),
        )
        op.create_index(f"ix_{table}_cafe_id", table, ["cafe_id"])


def downgrade() -> None:
    _tables_needing_cafe_id = [
        "sessions",
        "wallet_transactions",
        "games",
        "chat_messages",
        "notifications",
        "support_tickets",
        "announcements",
        "hardware_stats",
        "pricing_rules",
        "offers",
        "webhooks",
        "bookings",
        "screenshots",
        "product_categories",
        "products",
        "orders",
        "prizes",
        "leaderboards",
        "events",
        "coupons",
        "membership_packages",
        "user_groups",
        "settings",
    ]

    for table in reversed(_tables_needing_cafe_id):
        op.drop_index(f"ix_{table}_cafe_id", table_name=table)
        op.drop_column(table, "cafe_id")

    op.drop_index("ix_audit_logs_cafe_id", table_name="audit_logs")
    op.drop_column("audit_logs", "device_id")
    op.drop_column("audit_logs", "cafe_id")

    op.drop_column("client_pcs", "allowed_ip_range")
    op.drop_column("client_pcs", "device_status")
    op.drop_column("client_pcs", "device_secret_hash")

    op.drop_table("device_ip_history")
    op.drop_table("refresh_tokens")
    op.drop_table("user_cafe_map")
