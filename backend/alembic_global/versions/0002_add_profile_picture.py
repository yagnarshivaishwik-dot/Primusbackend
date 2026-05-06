"""Add profile_picture_url and profile_picture_updated_at to global users.

Mirrors the change in alembic/versions/005_add_profile_picture.py but for
the global identity database (multi-DB deployments use this one).

Revision ID: 0002_add_profile_picture
Revises: 0001_initial_global_schema
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_add_profile_picture"
down_revision = "0001_initial_global_schema"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    try:
        return column in {c["name"] for c in inspector.get_columns(table)}
    except Exception:
        return False


def upgrade() -> None:
    if not _has_column("users", "profile_picture_url"):
        op.add_column(
            "users",
            sa.Column("profile_picture_url", sa.Text(), nullable=True),
        )
    if not _has_column("users", "profile_picture_updated_at"):
        op.add_column(
            "users",
            sa.Column("profile_picture_updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("users", "profile_picture_updated_at"):
        op.drop_column("users", "profile_picture_updated_at")
    if _has_column("users", "profile_picture_url"):
        op.drop_column("users", "profile_picture_url")
