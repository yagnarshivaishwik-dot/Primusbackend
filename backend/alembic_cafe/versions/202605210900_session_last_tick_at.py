"""Add sessions.last_tick_at for Phase 2 server-authoritative timer.

Stores the server timestamp through which we've already debited
UserOffer minutes for this session. On every heartbeat / /active-package
poll, the paywall_tick service computes elapsed = utcnow() - last_tick_at,
debits up to PAYWALL_OFFLINE_CAP_MINUTES (env, default 30) from the
oldest UserOffer rows in FIFO order, then advances last_tick_at by
exactly debit_minutes*60 seconds — NOT utcnow() — so the fractional
remainder carries to the next tick.

Nullable for compatibility with rows that pre-date this column. The
service treats NULL as session.start_time on first touch.

No indexes needed — the column is only read on a single row lookup
by primary key.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260521_session_last_tick_at"
down_revision = "20260517_chat_drop_legacy_fks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("last_tick_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sessions", "last_tick_at")
