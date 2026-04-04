"""initial global schema

Revision ID: 0001_initial_global_schema
Revises:
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0001_initial_global_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------ users
    # Created first (without cafe_id FK — added below after cafes exists)
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("email", sa.String, unique=True, index=True, nullable=False),
        sa.Column("role", sa.String, default="client"),
        sa.Column("password_hash", sa.String, nullable=True),
        sa.Column("phone", sa.String, nullable=True),
        sa.Column("first_name", sa.String, nullable=True),
        sa.Column("last_name", sa.String, nullable=True),
        sa.Column("birthdate", sa.DateTime, nullable=True),
        sa.Column("tos_accepted", sa.Boolean, default=False),
        sa.Column("tos_accepted_at", sa.DateTime, nullable=True),
        sa.Column("two_factor_secret", sa.String, nullable=True),
        sa.Column("is_email_verified", sa.Boolean, default=False),
        sa.Column("email_verification_sent_at", sa.DateTime, nullable=True),
        # cafe_id added as plain integer first; FK constraint added after cafes
        sa.Column("cafe_id", sa.Integer, nullable=True),
        sa.Column("wallet_balance", sa.Numeric(12, 2), default=0),
        sa.Column("coins_balance", sa.Integer, default=0),
        sa.Column("user_group_id", sa.Integer, nullable=True),
    )

    # ------------------------------------------------------------------ cafes
    op.create_table(
        "cafes",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("name", sa.String, unique=True, nullable=False),
        sa.Column("location", sa.String, nullable=True),
        sa.Column("phone", sa.String, nullable=True),
        sa.Column("owner_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("db_provisioned", sa.Boolean, default=False),
        sa.Column("db_provisioned_at", sa.DateTime, nullable=True),
    )

    # Now add the FK from users.cafe_id → cafes.id
    op.create_foreign_key(
        "fk_users_cafe_id",
        "users", "cafes",
        ["cafe_id"], ["id"],
    )

    # ------------------------------------------------------------------ user_cafe_map
    op.create_table(
        "user_cafe_map",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=False, index=True),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("is_primary", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
        sa.UniqueConstraint("user_id", "cafe_id", name="uq_user_cafe"),
    )

    # ------------------------------------------------------------------ refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String, nullable=False, unique=True, index=True),
        sa.Column("device_id", sa.String, nullable=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=True),
        sa.Column("issued_at", sa.DateTime),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("revoked", sa.Boolean, default=False),
        sa.Column("revoked_at", sa.DateTime, nullable=True),
        sa.Column("ip_address", sa.String, nullable=True),
    )

    # ------------------------------------------------------------------ password_reset_tokens
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String, unique=True, index=True, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("used", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime),
    )

    # ------------------------------------------------------------------ subscriptions
    op.create_table(
        "subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=False, index=True),
        sa.Column("plan", sa.String, nullable=False),
        sa.Column("status", sa.String, nullable=False, default="active"),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String, default="INR"),
        sa.Column("billing_cycle", sa.String, default="monthly"),
        sa.Column("current_period_start", sa.DateTime, nullable=False),
        sa.Column("current_period_end", sa.DateTime, nullable=False),
        sa.Column("trial_ends_at", sa.DateTime, nullable=True),
        sa.Column("cancelled_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )

    # ------------------------------------------------------------------ invoices
    op.create_table(
        "invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("subscription_id", UUID(as_uuid=True), sa.ForeignKey("subscriptions.id"), nullable=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String, default="INR"),
        sa.Column("status", sa.String, nullable=False, default="draft"),
        sa.Column("due_date", sa.DateTime, nullable=False),
        sa.Column("paid_at", sa.DateTime, nullable=True),
        sa.Column("payment_method", sa.String, nullable=True),
        sa.Column("payment_reference", sa.String, nullable=True),
        sa.Column("line_items", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime),
    )

    # ------------------------------------------------------------------ platform_financial_audit
    op.create_table(
        "platform_financial_audit",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("cafe_id", sa.Integer, nullable=False, index=True),
        sa.Column("txn_type", sa.String, nullable=False, index=True),
        sa.Column("txn_ref", sa.String, nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String, default="INR"),
        sa.Column("user_id", sa.Integer, nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, index=True),
    )

    # ------------------------------------------------------------------ licenses
    op.create_table(
        "licenses",
        sa.Column("key", sa.String, primary_key=True, unique=True, index=True),
        sa.Column("cafe_id", sa.Integer, sa.ForeignKey("cafes.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.Column("max_pcs", sa.Integer, nullable=False),
    )

    # ------------------------------------------------------------------ license_keys
    op.create_table(
        "license_keys",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("key", sa.String, unique=True, index=True, nullable=False),
        sa.Column("assigned_to", sa.String, nullable=True),
        sa.Column("issued_at", sa.DateTime),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.Column("last_activated_ip", sa.String, nullable=True),
    )

    # ------------------------------------------------------------------ client_updates
    op.create_table(
        "client_updates",
        sa.Column("id", sa.Integer, primary_key=True, index=True),
        sa.Column("version", sa.String, unique=True, nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("file_url", sa.String, nullable=False),
        sa.Column("release_date", sa.DateTime),
        sa.Column("force_update", sa.Boolean, default=False),
        sa.Column("active", sa.Boolean, default=True),
    )


def downgrade():
    op.drop_constraint("fk_users_cafe_id", "users", type_="foreignkey")
    op.drop_table("client_updates")
    op.drop_table("license_keys")
    op.drop_table("licenses")
    op.drop_table("platform_financial_audit")
    op.drop_table("invoices")
    op.drop_table("subscriptions")
    op.drop_table("password_reset_tokens")
    op.drop_table("refresh_tokens")
    op.drop_table("user_cafe_map")
    op.drop_table("cafes")
    op.drop_table("users")
