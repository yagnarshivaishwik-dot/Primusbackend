"""Phase 5 — Offer inventory v2 (Cashfree dynamic packages).

Adds the columns the new admin Packages page + kiosk shop need:
  - thumbnail_url       VARCHAR        NULL
  - bonus_minutes       INTEGER        NOT NULL DEFAULT 0
  - discount_percent    DOUBLE         NOT NULL DEFAULT 0
  - tax_percent         DOUBLE         NOT NULL DEFAULT 0
  - display_order       INTEGER        NOT NULL DEFAULT 0   (+ index)
  - is_happy_hour_only  BOOLEAN        NOT NULL DEFAULT FALSE
  - happy_hour_start    VARCHAR(5)     NULL    ("HH:MM")
  - happy_hour_end      VARCHAR(5)     NULL    ("HH:MM")

Single-DB-mode (legacy) chain — see alembic_cafe/202605091200_offer_inventory_v2
for the per-cafe equivalent.

Revision ID: 010_offer_inventory_v2
Revises: 009_phase4_audit_chain
"""
from alembic import op
import sqlalchemy as sa


revision = "010_offer_inventory_v2"
down_revision = "009_phase4_audit_chain"
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
