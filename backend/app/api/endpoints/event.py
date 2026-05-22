import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db
from app.models import Event, EventProgress
from app.schemas import EventIn, EventOut, EventProgressOut

if MULTI_DB_ENABLED:
    from app.db.models_cafe import (
        CafeUser,
        CoinTransaction as CafeCoinTransaction,
    )
else:
    from app.models import CoinTransaction as CafeCoinTransaction  # type: ignore[no-redef]

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_rule(raw):
    """Same rule_json parser quests.py uses. Tolerant of None / bad JSON."""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return {}


@router.post("/", response_model=EventOut)
def create_event(
    evt: EventIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    e = Event(**evt.dict(), cafe_id=ctx.cafe_id, active=True)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.get("/", response_model=list[EventOut])
def list_events(
    include_all: bool = False,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    query = scoped_query(db, Event, ctx)
    if not include_all:
        now = datetime.now(UTC)
        query = query.filter(Event.active.is_(True), Event.start_time <= now, Event.end_time >= now)
    return query.order_by(Event.start_time.desc()).all()


@router.get("/all", response_model=list[EventOut])
def list_all_events(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Admin endpoint: returns all events (active, inactive, past, future)."""
    return (
        scoped_query(db, Event, ctx)
        .order_by(Event.start_time.desc())
        .all()
    )


@router.post("/progress/{event_id}", response_model=EventProgressOut)
def update_progress(
    event_id: int,
    delta: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    # Verify event belongs to user's cafe
    evt_obj = db.query(Event).filter_by(id=event_id).first()
    enforce_cafe_ownership(evt_obj, ctx)

    prog = db.query(EventProgress).filter_by(event_id=event_id, user_id=current_user.id).first()
    if not prog:
        prog = EventProgress(
            event_id=event_id, user_id=current_user.id, progress=0, completed=False
        )
        db.add(prog)
    prog.progress += max(0, delta)
    db.commit()
    db.refresh(prog)
    return prog


@router.post("/{event_id}/claim", response_model=EventProgressOut)
def claim_event(
    event_id: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Claim a completed event/challenge for its coin reward.

    Mirror of `quests.claim_quest` but scoped to the generic Event model
    so the kiosk Challenges feature can pay out coins on completion.
    Reads the reward shape from `Event.rule_json`:
        { "reward": { "kind": "coins", "amount": 100 }, "target": 1 }
    Behaviour:
      * 404 if event missing
      * 400 if progress < target ("Quest not complete yet")
      * idempotent: if already completed, returns the same row without
        re-crediting
      * credits CafeUser.coins_balance + writes a CoinTransaction
        (multi-DB) / global User.coins_balance (single-DB)
    """
    evt = db.query(Event).filter_by(id=event_id).first()
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    enforce_cafe_ownership(evt, ctx)

    rule = _parse_rule(getattr(evt, "rule_json", None))
    target = int(rule.get("target") or 1)
    reward = rule.get("reward") or {}
    reward_kind = (reward.get("kind") or "").lower()
    reward_amount = int(reward.get("amount") or 0)

    prog = (
        db.query(EventProgress)
        .filter_by(event_id=event_id, user_id=current_user.id)
        .first()
    )
    if prog is None:
        prog = EventProgress(
            event_id=event_id,
            user_id=current_user.id,
            progress=0,
            completed=False,
        )
        db.add(prog)

    # Idempotent: a re-claim returns the same row unchanged.
    if prog.completed:
        db.commit()
        db.refresh(prog)
        return prog

    if (prog.progress or 0) < target:
        raise HTTPException(
            status_code=400,
            detail=f"Quest not complete yet ({prog.progress or 0}/{target})",
        )

    prog.completed = True
    coins_credited = 0

    if reward_kind == "coins" and reward_amount > 0:
        if MULTI_DB_ENABLED:
            user_row = (
                db.query(CafeUser)
                .filter(CafeUser.global_user_id == current_user.id)
                .first()
            )
            # auth.py auto-provisions CafeUser at login (TECH_DEBT #23).
            # If we still don't see the row here, the session predates
            # that change OR the auth-side provisioning silently failed.
            # One last-ditch helper call before failing the request —
            # replaces a previous inline CafeUser(...).add() band-aid
            # that silently skipped the coin credit, leaving event
            # rewards unclaimed with no telemetry.
            if user_row is None:
                try:
                    from app.services.cafe_user_provisioning import ensure_cafe_user
                    ensure_cafe_user(
                        global_user_id=current_user.id,
                        cafe_id=ctx.cafe_id,
                        name=getattr(current_user, "name", None) or getattr(current_user, "email", None),
                        email=getattr(current_user, "email", None),
                    )
                    db.expire_all()
                    user_row = (
                        db.query(CafeUser)
                        .filter(CafeUser.global_user_id == current_user.id)
                        .first()
                    )
                except Exception as exc:
                    logger.warning(
                        "[EVENT CLAIM] ensure_cafe_user fallback failed for global_user_id=%s event=%s: %s",
                        current_user.id, event_id, exc,
                    )
        else:
            from app.models import User as _LegacyUser  # noqa: WPS433
            user_row = (
                db.query(_LegacyUser)
                .filter(_LegacyUser.id == current_user.id)
                .first()
            )

        if user_row is None:
            logger.warning(
                "[EVENT CLAIM] user row missing for global_user_id=%s event=%s — "
                "auth.py auto-provisioning may have failed; returning 409 to force re-login.",
                current_user.id, event_id,
            )
            raise HTTPException(
                status_code=409,
                detail="Your cafe-side account is missing. Please log out and log back in to refresh your session.",
            )

        user_row.coins_balance = (user_row.coins_balance or 0) + reward_amount
        db.add(
            CafeCoinTransaction(
                user_id=user_row.id,
                amount=reward_amount,
                reason=f"event_claim:{event_id}",
            )
        )
        coins_credited = reward_amount

    db.commit()
    db.refresh(prog)
    logger.info(
        "[EVENT CLAIM] user=%s event=%s reward=%s coins_credited=%d",
        current_user.id, event_id, reward, coins_credited,
    )
    return prog
