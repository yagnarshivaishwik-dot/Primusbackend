"""Drop stale chat_messages FKs that point at global-only tables.

In multi-DB mode the `users` and the legacy `pcs` tables are global; only
`client_pcs` exists in the per-cafe database. The original cafe schema
(inherited from a pre-multi-DB era) put referential constraints on
`chat_messages` against tables that don't actually exist in the cafe DB
(or are empty), so any insert from `/api/chat/` 500s with FK violation.

This migration:
  * Drops `chat_messages_pc_id_fkey`     (referenced empty `pcs` table)
  * Drops `chat_messages_from_user_id_fkey` (referenced global `users`)
  * Drops `chat_messages_to_user_id_fkey`   (referenced global `users`)
  * Loosens `from_user_id` to NULL-able (the FK that previously enforced
    presence is gone; admins occasionally broadcast with no sender id).

The columns themselves stay. We're only removing the FKs — referential
integrity for chat is enforced at the application layer instead.

Verified locally 2026-05-17 against `clutchhh_cafe_1`; rolled out as an
ad-hoc psql command before this migration was written. This file makes
the same change reproducible against the remaining 15 prod cafe DBs.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "20260517_chat_drop_legacy_fks"
down_revision = "c4d8e2f6a1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE chat_messages "
        "DROP CONSTRAINT IF EXISTS chat_messages_pc_id_fkey"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "DROP CONSTRAINT IF EXISTS chat_messages_from_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "DROP CONSTRAINT IF EXISTS chat_messages_to_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "ALTER COLUMN from_user_id DROP NOT NULL"
    )


def downgrade() -> None:
    # Best-effort restore. NOT NULL is re-applied first; if any existing
    # rows have a NULL from_user_id (we expect very few — admin broadcasts
    # only), the DDL will fail and an operator must purge them manually.
    op.execute(
        "ALTER TABLE chat_messages "
        "ALTER COLUMN from_user_id SET NOT NULL"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "ADD CONSTRAINT chat_messages_from_user_id_fkey "
        "FOREIGN KEY (from_user_id) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "ADD CONSTRAINT chat_messages_to_user_id_fkey "
        "FOREIGN KEY (to_user_id) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE chat_messages "
        "ADD CONSTRAINT chat_messages_pc_id_fkey "
        "FOREIGN KEY (pc_id) REFERENCES pcs(id)"
    )
