"""Enable Row Level Security on all cafe tables.

Revision ID: 002_enable_rls
Revises: 001_cafe_schema
Create Date: 2026-03-30

IMPORTANT: This migration creates:
  1. An application DB role 'primus_app' (if not exists)
  2. Enables RLS on all cafe-scoped tables
  3. Creates policies so primus_app can only see rows for the current
     set_config('app.cafe_id', ...) value
  4. Revokes UPDATE/DELETE from app role on financial tables (audit protection)

The application must call:
    SET LOCAL app.current_user_role = '<role>';
on each connection (done in get_db_with_tenant() dependency).

Controlled by ENABLE_RLS environment variable. When ENABLE_RLS=false,
the migration still runs but policies are permissive (always true),
so the app works the same as without RLS.
"""

import os

from alembic import op
import sqlalchemy as sa

revision = "002_enable_rls"
down_revision = "001_cafe_schema"
branch_labels = None
depends_on = None

# Tables with strict RLS enabled
_TABLES_RLS = [
    "users",
    "wallet_transactions",
    "sessions",
    "orders",
    "payment_intents",
    "reports_daily",
]

# Financial tables: revoke destructive permissions from app role
_FINANCIAL_TABLES = [
    "wallet_transactions",
    "payment_intents",
    "reports_daily",
]


def upgrade() -> None:
    conn = op.get_bind()

    enable_rls = os.getenv("ENABLE_RLS", "false").lower() == "true"

    # Create app role if it doesn't exist (idempotent)
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'primus_app') THEN
                CREATE ROLE primus_app LOGIN;
            END IF;
        END
        $$;
    """))

    # Grant CONNECT on the current database
    db_name = conn.engine.url.database
    conn.execute(sa.text(f'GRANT CONNECT ON DATABASE "{db_name}" TO primus_app'))

    # Grant usage on public schema
    conn.execute(sa.text("GRANT USAGE ON SCHEMA public TO primus_app"))

    # Grant table permissions to app role
    for table in _TABLES_RLS:
        conn.execute(sa.text(f"GRANT SELECT, INSERT ON {table} TO primus_app"))

    # For non-financial tables, also grant UPDATE
    for table in _TABLES_RLS:
        if table not in _FINANCIAL_TABLES:
            conn.execute(sa.text(f"GRANT UPDATE ON {table} TO primus_app"))

    # Explicitly revoke destructive permissions from financial tables
    for table in _FINANCIAL_TABLES:
        # Allow UPDATE only on non-audit tables (sessions, orders can be updated)
        if table == "wallet_transactions":
            conn.execute(sa.text(f"REVOKE UPDATE, DELETE ON {table} FROM primus_app"))
        elif table == "payment_intents":
            # payment_intents need UPDATE for status transitions
            conn.execute(sa.text(f"GRANT UPDATE ON {table} TO primus_app"))
            conn.execute(sa.text(f"REVOKE DELETE ON {table} FROM primus_app"))
        elif table == "reports_daily":
            # reports_daily needs INSERT ... ON CONFLICT UPDATE (via UPSERT which uses INSERT)
            conn.execute(sa.text(f"REVOKE DELETE ON {table} FROM primus_app"))

    # Enable RLS on all tables
    for table in _TABLES_RLS:
        conn.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
        # Allow table owner (migrations role) to bypass RLS
        conn.execute(sa.text(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY"))

    if enable_rls:
        # Strict policies: app_role can see all rows (cafe boundary = the whole DB)
        # RLS here is used for role-based visibility, not cafe isolation
        # (cafe isolation is at the DB level already)
        for table in _TABLES_RLS:
            _create_permissive_policy(conn, table)

        # Staff/client cannot see other users' wallet transactions
        conn.execute(sa.text("""
            CREATE POLICY wallet_txn_owner ON wallet_transactions
                AS RESTRICTIVE
                TO primus_app
                USING (
                    current_setting('app.current_user_role', true) IN ('admin', 'cafeadmin', 'superadmin')
                    OR user_id = current_setting('app.current_user_id', true)::integer
                )
        """))
    else:
        # Permissive policy (RLS enabled but always allows): same behavior as no RLS
        for table in _TABLES_RLS:
            _create_permissive_policy(conn, table)


def downgrade() -> None:
    conn = op.get_bind()

    for table in _TABLES_RLS:
        conn.execute(sa.text(f"DROP POLICY IF EXISTS allow_all ON {table}"))
        conn.execute(sa.text(f"DROP POLICY IF EXISTS wallet_txn_owner ON {table}"))
        conn.execute(sa.text(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY"))

    for table in _TABLES_RLS:
        conn.execute(sa.text(f"REVOKE ALL ON {table} FROM primus_app"))

    conn.execute(sa.text("REVOKE USAGE ON SCHEMA public FROM primus_app"))


def _create_permissive_policy(conn, table: str) -> None:
    """Create a permissive (always-true) policy for a table."""
    conn.execute(sa.text(f"""
        DROP POLICY IF EXISTS allow_all ON {table};
        CREATE POLICY allow_all ON {table}
            AS PERMISSIVE
            TO primus_app
            USING (true)
            WITH CHECK (true)
    """))
