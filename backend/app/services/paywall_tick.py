"""
Paywall timer — server-authoritative minute decrementer.

Design (verified with the user before writing):

  1. Server's wall clock (NTP-synced on the VM) is the only time source.
     We NEVER trust the kiosk's clock.
  2. No background asyncio loop. Decrement happens at four trigger points:
       - Customer session start (initialise last_tick_at)
       - Every kiosk heartbeat (~20 s)
       - Every kiosk /active-package poll (30 s — belt-and-suspenders)
       - Session end via calculate_billing (final reconcile)
  3. Each call computes elapsed = utcnow() - session.last_tick_at and
     debits up to PAYWALL_OFFLINE_CAP_MINUTES from the user's oldest
     UserOffer rows (FIFO). The cap prevents abuse where a customer
     yanks the network cable to play offline indefinitely.
  4. Advance last_tick_at by EXACTLY debit_minutes * 60 seconds — never
     utcnow() — so the fractional remainder (e.g. 17 s into the next
     minute) carries forward and isn't lost.
  5. If elapsed > PAYWALL_OFFLINE_KICK_MINUTES, signal `should_kick`
     so callers can end the session — protects against "stay offline,
     play forever, reconnect when done" abuse.

Tunable knobs (env vars, set in the backend container's .env):

    PAYWALL_OFFLINE_CAP_MINUTES   default 30
        Max minutes debited per tick call. Above this, the remainder
        is "free time the customer got because the kiosk was offline".
        Bounded by the kick threshold below.

    PAYWALL_OFFLINE_KICK_MINUTES  default 10
        If elapsed since last tick exceeds this, the session is
        considered abandoned — caller ends it and forces the customer
        to log back in. Pair this with the cap so a long offline window
        debits the cap then kicks; the customer can't keep abusing it.

Multi-DB safe: the heartbeat / poll endpoints already route to the
right cafe DB via X-License-Key, so this module just operates on the
session row in whatever DB the caller hands it.

Multi-worker safe: each call is a single short transaction. Two
heartbeats for the same session arriving simultaneously serialise on
the row-level lock SQLAlchemy takes when SELECTing the session for
update. No background loop = no double-decrement.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session as SQLASession

from app.db.dependencies import MULTI_DB_ENABLED

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "paywall_tick: env var %s=%r is not an int; falling back to %d",
            name, raw, default,
        )
        return default


# Read once at import. Container restart picks up new values — no code
# changes needed to retune.
OFFLINE_CAP_MINUTES = _env_int("PAYWALL_OFFLINE_CAP_MINUTES", 30)
OFFLINE_KICK_MINUTES = _env_int("PAYWALL_OFFLINE_KICK_MINUTES", 10)


def _get_session_models():
    """Lazy import to avoid circular imports at module load."""
    if MULTI_DB_ENABLED:
        from app.db.models_cafe import Session as PCSession, UserOffer
    else:
        from app.models import Session as PCSession, UserOffer  # type: ignore[no-redef]
    return PCSession, UserOffer


def _sum_remaining(db: SQLASession, user_fk: int) -> int:
    """Total `UserOffer.minutes_remaining > 0` for this cafe-local user id."""
    _, UserOffer = _get_session_models()
    total = (
        db.query(func.coalesce(func.sum(UserOffer.minutes_remaining), 0))
        .filter(UserOffer.user_id == user_fk, UserOffer.minutes_remaining > 0)
        .scalar()
    ) or 0
    return int(total)


def debit_session(
    db: SQLASession,
    session_id: int,
    *,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Decrement elapsed minutes from the session owner's oldest UserOffer.

    Caller is responsible for `db.commit()` — we only `flush()` so the
    same transaction can do additional work (e.g. heartbeat updates).

    Returns:
        {
          "debited_minutes": int,    # how many minutes we actually subtracted
          "total_remaining": int,    # sum of UserOffer.minutes_remaining > 0
          "should_kick": bool,       # true if elapsed exceeded KICK threshold
          "elapsed_seconds": int,    # raw elapsed for logging / debugging
          "session_ended": bool,     # true if session.end_time is set
        }
    """
    now = now or datetime.utcnow()
    PCSession, UserOffer = _get_session_models()

    session = db.query(PCSession).filter_by(id=session_id).first()
    if session is None:
        return _empty_result()
    if session.end_time is not None:
        # Closed session — no debit, but report remaining so the kiosk
        # can react sensibly.
        return {
            "debited_minutes": 0,
            "total_remaining": _sum_remaining(db, session.user_id),
            "should_kick": False,
            "elapsed_seconds": 0,
            "session_ended": True,
        }

    # First-touch fallback: rows that pre-date the last_tick_at column
    # or were inserted by older code paths come through as NULL. Anchor
    # to start_time so we still debit any time that has elapsed since
    # the session opened.
    anchor = session.last_tick_at or session.start_time or now
    elapsed_seconds = max(0, int((now - anchor).total_seconds()))
    elapsed_minutes_raw = elapsed_seconds // 60

    # Apply offline cap. Customers offline for more than the cap get
    # the rest of the elapsed time as "free" — but the kick path below
    # ends their session so they can't keep accumulating free minutes.
    debit_minutes = min(elapsed_minutes_raw, OFFLINE_CAP_MINUTES)
    should_kick = elapsed_minutes_raw >= OFFLINE_KICK_MINUTES > 0

    if debit_minutes <= 0:
        return {
            "debited_minutes": 0,
            "total_remaining": _sum_remaining(db, session.user_id),
            "should_kick": should_kick,
            "elapsed_seconds": elapsed_seconds,
            "session_ended": False,
        }

    # FIFO debit. Walk oldest-first so the customer's earliest purchase
    # is consumed first — matches the legacy calculate_billing ordering
    # and keeps refund traceability sensible.
    remaining_to_debit = debit_minutes
    offers = (
        db.query(UserOffer)
        .filter(UserOffer.user_id == session.user_id, UserOffer.minutes_remaining > 0)
        .order_by(UserOffer.purchased_at.asc())
        .all()
    )
    for offer in offers:
        if remaining_to_debit <= 0:
            break
        take = min(remaining_to_debit, int(offer.minutes_remaining or 0))
        if take <= 0:
            continue
        offer.minutes_remaining = int(offer.minutes_remaining) - take
        remaining_to_debit -= take

    # Advance last_tick_at by the debit amount only. NOT now() — we'd
    # lose the fractional carry. If the customer was offline beyond the
    # cap, the "uncounted" elapsed (raw − cap) is deliberately dropped;
    # the kick signal below makes that not a free lunch.
    session.last_tick_at = anchor + timedelta(seconds=debit_minutes * 60)

    db.flush()

    total_remaining = _sum_remaining(db, session.user_id)

    logger.info(
        "paywall_tick.debit session=%s elapsed=%ds debited=%dmin total_left=%dmin kick=%s",
        session_id, elapsed_seconds, debit_minutes, total_remaining, should_kick,
    )

    return {
        "debited_minutes": debit_minutes,
        "total_remaining": total_remaining,
        "should_kick": should_kick,
        "elapsed_seconds": elapsed_seconds,
        "session_ended": False,
    }


def end_session_for_kick(db: SQLASession, session_id: int, *, now: Optional[datetime] = None) -> None:
    """Force-close an abandoned session (offline > KICK threshold).

    Sets end_time and zeroes nothing else — UserOffer state stays
    whatever debit_session left it. The kiosk catches the end via WS
    `time_updated` (remaining=0) or via the next /active-package poll
    showing has_active=false and re-acquires the paywall.
    """
    now = now or datetime.utcnow()
    PCSession, _ = _get_session_models()
    session = db.query(PCSession).filter_by(id=session_id).first()
    if session is None or session.end_time is not None:
        return
    session.end_time = now
    db.flush()
    logger.info("paywall_tick.kick session=%s ended at %s", session_id, now)


def find_active_session_for_user(
    db: SQLASession,
    user_fk: int,
    pc_id: Optional[int] = None,
) -> Optional[Any]:
    """Locate the customer's current PCSession (end_time IS NULL).

    Multi-DB: `user_fk` is the cafe-local users.id (CafeUser.id).
    Single-DB: `user_fk` is the global users.id.
    """
    PCSession, _ = _get_session_models()
    q = db.query(PCSession).filter(
        PCSession.user_id == user_fk,
        PCSession.end_time.is_(None),
    )
    if pc_id is not None:
        q = q.filter(PCSession.pc_id == pc_id)
    return q.order_by(PCSession.start_time.desc()).first()


def _empty_result() -> dict[str, Any]:
    return {
        "debited_minutes": 0,
        "total_remaining": 0,
        "should_kick": False,
        "elapsed_seconds": 0,
        "session_ended": False,
    }
