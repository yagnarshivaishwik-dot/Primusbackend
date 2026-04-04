"""Initial cafe schema with all operational tables.

Revision ID: 001_cafe_schema
Revises:
Create Date: 2026-03-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "001_cafe_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Users (cafe-local, linked to global via global_user_id)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("global_user_id", sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True, index=True),
        sa.Column("role", sa.String(), default="client"),
        sa.Column("wallet_balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("coins_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("user_group_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("wallet_balance >= 0", name="ck_users_wallet_balance_nonneg"),
        sa.CheckConstraint("coins_balance >= 0", name="ck_users_coins_balance_nonneg"),
    )

    # Wallet transactions
    op.create_table(
        "wallet_transactions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True, unique=True),
    )

    # Sessions
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("pc_id", sa.Integer(), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )

    # Orders
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(), nullable=True, unique=True),
    )

    # Payment intents (UPI / Razorpay)
    op.create_table(
        "payment_intents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("provider", sa.String(), nullable=False, server_default="razorpay"),
        sa.Column("provider_ref", sa.String(), nullable=True, unique=True),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("upi_vpa", sa.String(), nullable=True),
        sa.Column("qr_data", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True, unique=True),
        sa.Column("webhook_payload", JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Daily revenue reports
    op.create_table(
        "reports_daily",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("report_date", sa.Date(), nullable=False, unique=True),
        sa.Column("total_revenue", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_sessions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_wallet_topups", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_wallet_deductions", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_orders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_order_revenue", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_upi_payments", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_table("reports_daily")
    op.drop_table("payment_intents")
    op.drop_table("orders")
    op.drop_table("sessions")
    op.drop_table("wallet_transactions")
    op.drop_table("users")
