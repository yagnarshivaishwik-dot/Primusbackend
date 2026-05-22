"""Ensure a global user has a corresponding row in their cafe's local user table.

Called from the auth endpoints (login / register / refresh) once we know
the JWT we're about to issue will carry a `cafe_id`. Without this, every
downstream endpoint that wants to credit something to `CafeUser.coins_balance`
or `CafeUser.wallet_balance` has to remember to provision the row itself
(see TECH_DEBT #23 for context).

Idempotent — a second call for the same (cafe_id, global_user_id) is a no-op.
Wrapped in try/except by callers so a provisioning failure can't break login.
"""
from __future__ import annotations

import logging
from typing import Optional

from app.db.dependencies import MULTI_DB_ENABLED

logger = logging.getLogger(__name__)


def ensure_cafe_user(
    *,
    global_user_id: int,
    cafe_id: Optional[int],
    name: Optional[str] = None,
    email: Optional[str] = None,
    role: str = "client",
) -> None:
    """Create a CafeUser row for `global_user_id` in cafe `cafe_id` if missing.

    Does nothing if multi-DB mode is disabled (single-DB layouts already
    keep the user in one place) or if `cafe_id` is None (e.g. a superadmin
    login that isn't bound to a specific cafe).
    """
    if not MULTI_DB_ENABLED:
        return
    if cafe_id is None:
        return

    # Lazy imports: importing models_cafe at module top would pull in the
    # multi-DB router before its config has loaded in some test setups.
    from app.db.models_cafe import CafeUser
    from app.db.router import cafe_db_router

    db = cafe_db_router.get_session(cafe_id)
    try:
        existing = (
            db.query(CafeUser)
            .filter(CafeUser.global_user_id == global_user_id)
            .first()
        )
        if existing is not None:
            return  # already provisioned

        db.add(
            CafeUser(
                global_user_id=global_user_id,
                name=name or email,
                email=email,
                role=role,
                wallet_balance=0,
                coins_balance=0,
            )
        )
        db.commit()
        logger.info(
            "[CAFE PROVISION] inserted CafeUser global_user_id=%s cafe_id=%s role=%s",
            global_user_id, cafe_id, role,
        )
    except Exception as exc:
        # Rollback so the session is clean for any subsequent operations by
        # the caller. We don't re-raise — provisioning is best-effort here;
        # the endpoint-side band-aid in home.py / quests.py still catches
        # any drift that slips through.
        db.rollback()
        logger.warning(
            "[CAFE PROVISION] failed for global_user_id=%s cafe_id=%s: %s",
            global_user_id, cafe_id, exc,
        )
    finally:
        db.close()


def resolve_cafe_user_fk(
    db,
    *,
    global_user_id: int,
    cafe_id: Optional[int],
) -> Optional[int]:
    """Translate a global user id to the cafe-local ``users.id`` for FK use.

    Background: every cafe-scoped table that has a ``user_id`` column
    (sessions.user_id, user_offers.user_id, wallet_transactions.user_id, …)
    FKs to the cafe-DB-local ``users.id`` — i.e. ``CafeUser.id`` — NOT
    the global user id. The kiosk / webhook layer carries the GLOBAL id
    (it's in the JWT, it's what Cashfree was handed at order-create time);
    every INSERT into a cafe-scoped table needs to translate it first or
    Postgres raises ``ForeignKeyViolation``.

    This helper centralises the translation that previously lived inline
    in ``api/endpoints/session.py`` and was about to be copy-pasted into
    ``api/endpoints/cashfree.py``. Future cafe-scoped endpoints that need
    a user FK should call this rather than re-rolling the logic.

    Semantics:
      - Single-DB mode (or ``cafe_id`` is None): pass-through. The legacy
        schema has one ``users`` table and the global id IS the FK.
      - Multi-DB mode: ensure the ``CafeUser`` mirror exists (idempotent),
        then query by ``global_user_id`` and return the local ``id``.
        Returns None if provisioning genuinely failed and no row exists —
        the caller is responsible for raising the appropriate HTTP error
        so this service layer stays free of FastAPI dependencies.

    ``db`` must already be a session bound to the right cafe DB (the
    helper does NOT open its own session for the lookup — that would risk
    the same cross-transaction visibility we work around below).

    The expire-then-refetch dance is intentional: ``ensure_cafe_user``
    runs its INSERT in a separate session (router-owned), and depending
    on Postgres isolation + commit timing the caller's session can hold
    a stale snapshot that doesn't yet see the new row.
    """
    if not MULTI_DB_ENABLED or cafe_id is None:
        return global_user_id

    from app.db.models_cafe import CafeUser

    try:
        ensure_cafe_user(global_user_id=global_user_id, cafe_id=cafe_id)
    except Exception:
        # ensure_cafe_user already logs; swallow so the lookup below gets
        # a chance — if the row was already there, the INSERT-failure
        # doesn't matter.
        pass

    cafe_user = (
        db.query(CafeUser)
        .filter(CafeUser.global_user_id == global_user_id)
        .first()
    )
    if cafe_user is None:
        db.expire_all()
        cafe_user = (
            db.query(CafeUser)
            .filter(CafeUser.global_user_id == global_user_id)
            .first()
        )

    return cafe_user.id if cafe_user else None
