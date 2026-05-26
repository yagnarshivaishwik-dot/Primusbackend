"""Add user-scoped RLS policies on user-owned tables.

Migration 002_enable_rls turned on Row Level Security with PERMISSIVE
policies (everyone can see everything). This migration adds a second
RESTRICTIVE layer for the tables that store **user-owned** rows, so a
compromised app session bound to user X cannot fetch user Y's data.

The policies check two GUCs that the per-request dependency in
``app/db/dependencies.py:_set_tenant_context`` already sets:

  - ``app.user_id``     — set to the authenticated user id (integer)
  - ``app.bypass_rls``  — set to ``'true'`` for admin / superadmin sessions

If the GUC is unset (e.g. background worker), the casts fall back to
NULL and the policy denies access — which is the desired safe default.

Revision ID: 009_enable_rls_restrictive
Revises: 008_missing_indexes
Create Date: 2026-05-25
"""

import sqlalchemy as sa
from alembic import op


revision = "009_enable_rls_restrictive"
down_revision = "008_missing_indexes"
branch_labels = None
depends_on = None


_USER_SCOPED_TABLES: list[str] = [
    "wallet_transactions",
    "sessions",
    "payment_intents",
    "orders",
    "user_offers",
    "bookings",
]


def _policy_clause(table: str) -> str:
    return (
        f"(user_id = NULLIF(current_setting('app.user_id', true), '')::int "
        f"OR NULLIF(current_setting('app.bypass_rls', true), '') = 'true')"
    )


def upgrade() -> None:
    conn = op.get_bind()
    for table in _USER_SCOPED_TABLES:
        # Make sure RLS is on (002_enable_rls turned it on for some; defence in depth)
        conn.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

        policy_name = f"{table}_user_isolation"
        # Drop and re-create for idempotency.
        conn.execute(sa.text(
            f"DROP POLICY IF EXISTS {policy_name} ON {table}"
        ))
        clause = _policy_clause(table)
        conn.execute(sa.text(
            f"CREATE POLICY {policy_name} ON {table} "
            f"AS RESTRICTIVE "
            f"FOR ALL "
            f"USING ({clause}) "
            f"WITH CHECK ({clause})"
        ))


def downgrade() -> None:
    conn = op.get_bind()
    for table in _USER_SCOPED_TABLES:
        policy_name = f"{table}_user_isolation"
        conn.execute(sa.text(f"DROP POLICY IF EXISTS {policy_name} ON {table}"))
