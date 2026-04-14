"""Add campaigns table for marketing features.

Revision ID: 004_add_campaigns
Revises: 003_add_indexes_and_matviews
Create Date: 2026-04-06
"""

import sqlalchemy as sa
from alembic import op

revision = "004_add_campaigns"
down_revision = "003_add_indexes_and_matviews"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False, server_default="discount"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("image_url", sa.String(), nullable=True),
        sa.Column("discount_percent", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("target_audience", sa.String(), nullable=False, server_default="all"),
        sa.Column("start_date", sa.DateTime(), nullable=True),
        sa.Column("end_date", sa.DateTime(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_campaigns_active", "campaigns", ["active"])
    op.create_index("ix_campaigns_type", "campaigns", ["type"])


def downgrade() -> None:
    op.drop_index("ix_campaigns_type", table_name="campaigns")
    op.drop_index("ix_campaigns_active", table_name="campaigns")
    op.drop_table("campaigns")
