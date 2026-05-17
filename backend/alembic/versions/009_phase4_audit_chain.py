"""Stub for the missing 009_phase4_audit_chain migration.

010_offer_inventory_v2.py was committed to the repo with a down_revision
of "009_phase4_audit_chain", but the 009 file itself was never committed.
That left alembic unable to build its revision map at all (KeyError on
009_phase4_audit_chain), which blocked *any* migration from running —
including unrelated ones like 006_create_missing_tables.

This stub restores the chain so alembic can resolve targets. It is
deliberately a no-op: we don't know what the original 009 was supposed
to do (the file name suggests something about audit-log chaining), so
attempting to recreate it would be a guess. When the team locates the
real 009 (or decides the change is no longer needed), they should:

  - Replace this stub with the real migration body, OR
  - Delete this file AND 010_offer_inventory_v2.py and renumber, OR
  - Rebase 010 onto whichever revision actually precedes it.

Until then, this stub keeps the chain valid without touching the
database. Tracked in TECH_DEBT.md item #13.

Revision ID: 009_phase4_audit_chain
Revises: 005_add_profile_picture
Create Date: 2026-05-14
"""

revision = "009_phase4_audit_chain"
down_revision = "005_add_profile_picture"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op stub. See module docstring for context.
    pass


def downgrade() -> None:
    # No-op stub. See module docstring for context.
    pass
