"""Loyalty points earned on session completion.

Hooked into the session-complete transition: when ``Session.end_time`` is
stamped and the session is marked paid, enqueue
``award_loyalty_on_session_complete.delay(session_id)`` to credit the
user's ``coins_balance`` and record a ``WalletTransaction`` receipt.

Idempotency is enforced via
``WalletTransaction.idempotency_key = f"loyalty:session:{session_id}"`` —
replayed task invocations are silent no-ops.
"""

from __future__ import annotations

import logging
import math
import os
from datetime import datetime

from celery import shared_task
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)


def _coin_rate_per_hour() -> int:
    """Integer coins per full hour of play. Configurable via env."""
    try:
        return max(0, int(os.getenv("LOYALTY_COINS_PER_HOUR", "50")))
    except ValueError:
        return 50


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=3,
)
def award_loyalty_on_session_complete(self, session_id: int) -> int:
    """Credit loyalty coins proportional to session duration.

    Returns the number of coins credited (0 if the session already
    earned coins or has no duration).
    """
    try:
        from app.db.dependencies import get_cafe_db as _get_db  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.db.database import SessionLocal as _get_db  # type: ignore[attr-defined]
        except Exception:
            logger.warning("[loyalty] no DB helper found; skipping")
            return 0

    try:
        from app.db.models_cafe import Session as PlaySession, WalletTransaction  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.models import Session as PlaySession, WalletTransaction  # type: ignore[attr-defined]
        except Exception:
            logger.warning("[loyalty] Session model not importable; skipping")
            return 0

    try:
        db = _get_db()
    except TypeError:
        db = next(_get_db())  # type: ignore[arg-type]

    try:
        row = db.query(PlaySession).filter_by(id=session_id).first()
        if not row or not row.start_time or not row.end_time:
            return 0
        duration = row.end_time - row.start_time
        hours = max(0.0, duration.total_seconds() / 3600.0)
        coins = int(math.floor(hours * _coin_rate_per_hour()))
        if coins <= 0:
            return 0

        idempotency_key = f"loyalty:session:{session_id}"
        existing = (
            db.query(WalletTransaction)
            .filter_by(idempotency_key=idempotency_key)
            .first()
        )
        if existing:
            return 0

        # Credit coins on the user row.
        try:
            from app.db.models_cafe import User as UserRow  # type: ignore[attr-defined]
        except Exception:
            from app.models import User as UserRow  # type: ignore[attr-defined]

        user = db.query(UserRow).filter_by(id=row.user_id).with_for_update().first()
        if not user:
            return 0
        user.coins_balance = (user.coins_balance or 0) + coins

        tx = WalletTransaction(
            user_id=user.id,
            amount=coins,  # stored as Numeric(12,2); coins are whole numbers
            type="loyalty_earn",
            description=f"session:{session_id}",
            idempotency_key=idempotency_key,
            timestamp=datetime.utcnow(),
        )
        db.add(tx)
        try:
            db.commit()
        except IntegrityError:
            # Lost the race with another worker — both saw no existing
            # row, both inserted; the unique index on idempotency_key
            # saves us. Roll back and return 0.
            db.rollback()
            return 0

        return coins
    finally:
        try:
            db.close()
        except Exception:
            pass
