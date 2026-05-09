"""Offer inventory v2 — per-cafe DB (Cashfree dynamic packages).

Adds the columns the new admin Packages page + kiosk shop need to the
per-cafe `offers` table. Mirrors alembic/010_offer_inventory_v2.py but
runs against every per-cafe database via the alembic_cafe chain.

Cafe-DB schema has NO cafe_id column — the database itself is the
boundary, so we only add the new product/promo fields here.

Revision ID: c4d8e2f6a1b9
Revises: f8c2a4d61b03
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa


revision = "c4d8e2f6a1b9"
down_revision = "f8c2a4d61b03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("thumbnail_url", sa.String(), nullable=True))
    op.add_column(
        "offers",
        sa.Column("bonus_minutes", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "offers",
        sa.Column("discount_percent", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "offers",
        sa.Column("tax_percent", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "offers",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "offers",
        sa.Column(
            "is_happy_hour_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column("offers", sa.Column("happy_hour_start", sa.String(length=5), nullable=True))
    op.add_column("offers", sa.Column("happy_hour_end", sa.String(length=5), nullable=True))

    op.create_index(
        "ix_offers_display_order",
        "offers",
        ["display_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_offers_display_order", table_name="offers")
    op.drop_column("offers", "happy_hour_end")
    op.drop_column("offers", "happy_hour_start")
    op.drop_column("offers", "is_happy_hour_only")
    op.drop_column("offers", "display_order")
    op.drop_column("offers", "tax_percent")
    op.drop_column("offers", "discount_percent")
    op.drop_column("offers", "bonus_minutes")
    op.drop_column("offers", "thumbnail_url")
