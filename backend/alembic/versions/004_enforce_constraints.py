"""Add composite performance indexes for multi-tenant queries and enforce defaults.

Revision ID: 004_enforce_constraints
Revises: 003_backfill_cafe_ids
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op

revision = "004_enforce_constraints"
down_revision = "003_backfill_cafe_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite indexes for common multi-tenant queries
    op.create_index(
        "ix_client_pcs_cafe_id_status",
        "client_pcs",
        ["cafe_id", "status"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_sessions_cafe_id_user_id",
        "sessions",
        ["cafe_id", "user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_wallet_transactions_cafe_id_user_id",
        "wallet_transactions",
        ["cafe_id", "user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_remote_commands_pc_id_state",
        "remote_commands",
        ["pc_id", "state"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_refresh_tokens_cafe_id",
        "refresh_tokens",
        ["cafe_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_refresh_tokens_expires_at",
        "refresh_tokens",
        ["expires_at"],
        if_not_exists=True,
    )

    # Ensure device_status has a value for all existing rows
    op.execute(
        "UPDATE client_pcs SET device_status = 'active' WHERE device_status IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_expires_at", table_name="refresh_tokens", if_exists=True)
    op.drop_index("ix_refresh_tokens_cafe_id", table_name="refresh_tokens", if_exists=True)
    op.drop_index("ix_remote_commands_pc_id_state", table_name="remote_commands", if_exists=True)
    op.drop_index("ix_wallet_transactions_cafe_id_user_id", table_name="wallet_transactions", if_exists=True)
    op.drop_index("ix_sessions_cafe_id_user_id", table_name="sessions", if_exists=True)
    op.drop_index("ix_client_pcs_cafe_id_status", table_name="client_pcs", if_exists=True)
