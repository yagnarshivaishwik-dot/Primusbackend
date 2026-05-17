"""Create subscriptions, invoices, platform_financial_audit in clutchhh_global.

Three global-scope billing/audit tables defined as SQLAlchemy models in
``app/db/models_global.py`` but never had a corresponding ``create_table``
migration. Verified missing on prod 2026-05-14 via direct DB inspection
(``SELECT tablename FROM pg_tables`` returned 0 rows for all three).

Background:
  - These features (cafe SaaS subscription, invoice generation, money-movement
    audit) have backend endpoints (``app/api/endpoints/subscription.py``) but
    no frontend caller yet. The migration is forward-looking: when the UI is
    built, the schema is ready.
  - No RLS policies are added even though the docs claim RLS is mandatory in
    production. Verified 2026-05-14 that ZERO existing tables in
    ``clutchhh_global`` have ``rowsecurity = true``. Matching the existing
    convention; the doc/code mismatch is logged separately as tech debt.

Schema source: the DDL is the exact ``CREATE TABLE`` SQLAlchemy emits for
the matching models (captured via
``CreateTable(...).compile(postgresql.dialect())``).

Revision ID: 0003_create_billing_tables
Revises: 0002_add_profile_picture
Create Date: 2026-05-14
"""

from alembic import op


revision = "0003_create_billing_tables"
down_revision = "0002_add_profile_picture"
branch_labels = None
depends_on = None


# Executed in order. ``invoices`` references ``subscriptions`` so subscriptions
# must come first. ``platform_financial_audit`` is independent.
UPGRADE_STATEMENTS = [
    """
    CREATE TABLE subscriptions (
        id UUID NOT NULL,
        cafe_id INTEGER NOT NULL,
        plan VARCHAR NOT NULL,
        status VARCHAR NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR,
        billing_cycle VARCHAR,
        current_period_start TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        current_period_end TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        trial_ends_at TIMESTAMP WITHOUT TIME ZONE,
        cancelled_at TIMESTAMP WITHOUT TIME ZONE,
        created_at TIMESTAMP WITHOUT TIME ZONE,
        updated_at TIMESTAMP WITHOUT TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(cafe_id) REFERENCES cafes (id)
    )
    """,
    """
    CREATE TABLE invoices (
        id UUID NOT NULL,
        subscription_id UUID,
        cafe_id INTEGER NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR,
        status VARCHAR NOT NULL,
        due_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
        paid_at TIMESTAMP WITHOUT TIME ZONE,
        payment_method VARCHAR,
        payment_reference VARCHAR,
        line_items JSONB,
        created_at TIMESTAMP WITHOUT TIME ZONE,
        PRIMARY KEY (id),
        FOREIGN KEY(subscription_id) REFERENCES subscriptions (id),
        FOREIGN KEY(cafe_id) REFERENCES cafes (id)
    )
    """,
    """
    CREATE TABLE platform_financial_audit (
        id UUID NOT NULL,
        cafe_id INTEGER NOT NULL,
        txn_type VARCHAR NOT NULL,
        txn_ref VARCHAR,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR,
        user_id INTEGER,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITHOUT TIME ZONE,
        PRIMARY KEY (id)
    )
    """,
]


# Drop in reverse-dependency order: invoices references subscriptions.
DOWNGRADE_TABLES = [
    "platform_financial_audit",
    "invoices",
    "subscriptions",
]


def upgrade() -> None:
    for stmt in UPGRADE_STATEMENTS:
        op.execute(stmt)


def downgrade() -> None:
    for table in DOWNGRADE_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
