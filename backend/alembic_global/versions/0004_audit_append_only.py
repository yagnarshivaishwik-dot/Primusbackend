"""Make platform_financial_audit append-only (revoke UPDATE/DELETE).

The platform_financial_audit table is the canonical money-movement record
for the platform. To satisfy basic auditability requirements:

  1. REVOKE UPDATE, DELETE from PUBLIC and from the application role
     (``primus_user``) on the table.
  2. Install ``ON UPDATE DO INSTEAD NOTHING`` and ``ON DELETE DO INSTEAD
     NOTHING`` rules so that even a future GRANT, a connection running
     as table owner, or a stray app-level ``DELETE`` cannot mutate or
     remove rows. The privilege revocation is the first line of defense;
     the rules are the second.

Notes:
  - The application currently writes audit rows from ``app/api/endpoints/billing.py``
    and ``app/services/payments.py`` via plain INSERTs, which remain allowed.
  - Schema owner can still TRUNCATE / DROP TABLE — that is *intentional*
    so legitimate retention / DSR operations are still possible by a
    DBA, but with a paper trail (we recommend running them via a wrapped
    migration, never ad-hoc).
  - The downgrade restores GRANTs but *compromises the audit guarantee*.
    Only run it if you understand the consequence.

Revision ID: 0004_audit_append_only
Revises: 0003_create_billing_tables
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_audit_append_only"
down_revision = "0003_create_billing_tables"
branch_labels = None
depends_on = None


# Application DB role — taken from env.example / setup_observability.sh.
# If your deployment uses a different role name, set it via the
# AUDIT_APP_ROLE env var before running this migration.
APP_ROLE = "primus_user"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Revoke destructive privileges from PUBLIC + app role.
    conn.execute(sa.text(
        "REVOKE UPDATE, DELETE ON platform_financial_audit FROM PUBLIC"
    ))

    # Detect role existence before REVOKE so we don't fail on fresh DBs
    # where the app role hasn't been provisioned yet.
    conn.execute(sa.text(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                REVOKE UPDATE, DELETE ON platform_financial_audit FROM {APP_ROLE};
            END IF;
        END
        $$;
    """))

    # 2. Install RULES so even a privileged caller can't mutate rows.
    conn.execute(sa.text(
        "CREATE OR REPLACE RULE no_update_audit AS "
        "ON UPDATE TO platform_financial_audit DO INSTEAD NOTHING"
    ))
    conn.execute(sa.text(
        "CREATE OR REPLACE RULE no_delete_audit AS "
        "ON DELETE TO platform_financial_audit DO INSTEAD NOTHING"
    ))


def downgrade() -> None:
    # WARNING: downgrading this migration *compromises the audit guarantee*.
    # The platform_financial_audit table will once again be mutable by the
    # application role. Only run this if you have a separate compensating
    # control (e.g. a logical-replication audit sink) in place.
    conn = op.get_bind()

    conn.execute(sa.text("DROP RULE IF EXISTS no_delete_audit ON platform_financial_audit"))
    conn.execute(sa.text("DROP RULE IF EXISTS no_update_audit ON platform_financial_audit"))

    conn.execute(sa.text(f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                GRANT UPDATE, DELETE ON platform_financial_audit TO {APP_ROLE};
            END IF;
        END
        $$;
    """))
