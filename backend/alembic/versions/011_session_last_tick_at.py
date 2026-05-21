"""Add sessions.last_tick_at for Phase 2 server-authoritative timer.

Mirror of the alembic_cafe migration with the same name — kept in
sync because the legacy single-DB schema and the per-cafe DB schema
both have a `sessions` table that the paywall_tick service writes to.

See alembic_cafe/versions/202605210900_session_last_tick_at.py for
the full design rationale.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "011_session_last_tick_at"
down_revision = "010_offer_inventory_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("last_tick_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "last_tick_at")
