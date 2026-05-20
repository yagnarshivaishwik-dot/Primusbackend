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
