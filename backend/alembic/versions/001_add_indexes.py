"""Add database indexes for performance

Revision ID: 001_add_indexes
Revises:
Create Date: 2025-01-27

"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "001_add_indexes"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add indexes for frequently queried columns

    # Users table indexes
    op.create_index("ix_users_email", "users", ["email"], unique=True, if_not_exists=True)
    op.create_index("ix_users_role", "users", ["role"], if_not_exists=True)
    op.create_index("ix_users_cafe_id", "users", ["cafe_id"], if_not_exists=True)

    # Wallet transactions indexes
    op.create_index(
        "ix_wallet_transactions_user_id", "wallet_transactions", ["user_id"], if_not_exists=True
    )
    op.create_index(
        "ix_wallet_transactions_timestamp", "wallet_transactions", ["timestamp"], if_not_exists=True
    )
    op.create_index(
        "ix_wallet_transactions_type", "wallet_transactions", ["type"], if_not_exists=True
    )

    # Chat messages indexes
    op.create_index(
        "ix_chat_messages_to_user_id", "chat_messages", ["to_user_id"], if_not_exists=True
    )
    op.create_index(
        "ix_chat_messages_from_user_id", "chat_messages", ["from_user_id"], if_not_exists=True
    )
    op.create_index(
        "ix_chat_messages_timestamp", "chat_messages", ["timestamp"], if_not_exists=True
    )

    # Sessions indexes
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], if_not_exists=True)
    op.create_index("ix_sessions_pc_id", "sessions", ["pc_id"], if_not_exists=True)
    op.create_index("ix_sessions_start_time", "sessions", ["start_time"], if_not_exists=True)

    # Remote commands indexes
    op.create_index("ix_remote_commands_pc_id", "remote_commands", ["pc_id"], if_not_exists=True)
    op.create_index(
        "ix_remote_commands_executed", "remote_commands", ["executed"], if_not_exists=True
    )
    op.create_index(
        "ix_remote_commands_issued_at", "remote_commands", ["issued_at"], if_not_exists=True
    )

    # Audit logs indexes
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], if_not_exists=True)
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], if_not_exists=True)
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"], if_not_exists=True)

    # ClientPC indexes
    op.create_index(
        "ix_client_pcs_current_user_id", "client_pcs", ["current_user_id"], if_not_exists=True
    )
    op.create_index("ix_client_pcs_cafe_id", "client_pcs", ["cafe_id"], if_not_exists=True)
    op.create_index("ix_client_pcs_status", "client_pcs", ["status"], if_not_exists=True)


def downgrade() -> None:
    # Remove indexes
    op.drop_index("ix_client_pcs_status", table_name="client_pcs", if_exists=True)
    op.drop_index("ix_client_pcs_cafe_id", table_name="client_pcs", if_exists=True)
    op.drop_index("ix_client_pcs_current_user_id", table_name="client_pcs", if_exists=True)
    op.drop_index("ix_audit_logs_timestamp", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_audit_logs_action", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_remote_commands_issued_at", table_name="remote_commands", if_exists=True)
    op.drop_index("ix_remote_commands_executed", table_name="remote_commands", if_exists=True)
    op.drop_index("ix_remote_commands_pc_id", table_name="remote_commands", if_exists=True)
    op.drop_index("ix_sessions_start_time", table_name="sessions", if_exists=True)
    op.drop_index("ix_sessions_pc_id", table_name="sessions", if_exists=True)
    op.drop_index("ix_sessions_user_id", table_name="sessions", if_exists=True)
    op.drop_index("ix_chat_messages_timestamp", table_name="chat_messages", if_exists=True)
    op.drop_index("ix_chat_messages_from_user_id", table_name="chat_messages", if_exists=True)
    op.drop_index("ix_chat_messages_to_user_id", table_name="chat_messages", if_exists=True)
    op.drop_index("ix_wallet_transactions_type", table_name="wallet_transactions", if_exists=True)
    op.drop_index(
        "ix_wallet_transactions_timestamp", table_name="wallet_transactions", if_exists=True
    )
    op.drop_index(
        "ix_wallet_transactions_user_id", table_name="wallet_transactions", if_exists=True
    )
    op.drop_index("ix_users_cafe_id", table_name="users", if_exists=True)
    op.drop_index("ix_users_role", table_name="users", if_exists=True)
    op.drop_index("ix_users_email", table_name="users", if_exists=True)
