"""Document the legacy-chain orphan fix (no-op for the global DB).

The single-DB / legacy alembic chain at ``backend/alembic/versions/`` had
``010_offer_inventory_v2.py`` pointing at a non-existent parent revision
``009_phase4_audit_chain``. The stub file
``backend/alembic/versions/009_phase4_audit_chain.py`` already exists in
that chain to restore the revision map (see TECH_DEBT.md item #13).

This migration in the **global** chain exists so the chain-repair work
is visible in the canonical migration log of the production DB — anyone
running ``alembic_global history`` will see a marker that the legacy
chain was broken and how it was fixed. It performs **no schema changes**.

Background:
  - ``backend/alembic/versions/009_phase4_audit_chain.py`` is a deliberate
    no-op stub. Its ``down_revision = "005_add_profile_picture"`` restores
    the revision map so ``alembic upgrade head`` no longer raises
    ``KeyError: 009_phase4_audit_chain``.
  - The legacy chain only runs on dev/test boxes; production has moved
    to the split global / per-cafe chains, but the legacy ini file is
    still wired up via ``backend/alembic.ini`` for those environments.
  - When the team is comfortable that nothing depends on the legacy
    chain, both ``009_phase4_audit_chain.py`` and
    ``010_offer_inventory_v2.py`` should be removed from
    ``backend/alembic/versions/`` and this stub from
    ``backend/alembic_global/versions/``.

Revision ID: 0006_fix_chain_orphan
Revises: 0005_global_tz_and_constraints
Create Date: 2026-05-25
"""

revision = "0006_fix_chain_orphan"
down_revision = "0005_global_tz_and_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op. See module docstring."""
    return None


def downgrade() -> None:
    """No-op. See module docstring."""
    return None
