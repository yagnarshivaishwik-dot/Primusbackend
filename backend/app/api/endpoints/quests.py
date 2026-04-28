"""User-facing quests API.

Builds on the existing Event/EventProgress tables (Event.type='quest')
that the engagement system already uses. Returns one row per active
quest for the current user, joined with their progress so the kiosk
homepage and full quests page can render them in one round-trip.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import MULTI_DB_ENABLED

if MULTI_DB_ENABLED:
    from app.db.models_cafe import Event, EventProgress
    from app.db.global_db import global_session_factory
    from app.db.router import cafe_db_router
else:
    from app.models import Event, EventProgress  # type: ignore[no-redef]
    from app.db.global_db import global_session_factory

router = APIRouter()
logger = logging.getLogger(__name__)


class QuestOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    target: int = 0          # parsed from rule_json.target if present, else 1
    progress: int = 0        # current user's progress
    completed: bool = False
    reward_label: Optional[str] = None  # e.g. "100 ggCoins" if rule_json.reward.label
    reward_kind: Optional[str] = None   # "coins" | "minutes" | "discount" | None
    reward_amount: float = 0.0
    expires_at: Optional[datetime] = None
    claimed: bool = False    # alias of completed for kiosk UI clarity


def _open_db(ctx: AuthContext) -> Session:
    """Same pattern as shop._get_cafe_db: respect multi-DB mode but
    fall back to the global session when ctx has no cafe yet."""
    if not MULTI_DB_ENABLED or not ctx.cafe_id:
        return global_session_factory()
    return cafe_db_router.get_session(ctx.cafe_id)


def _parse_rule(raw: str | None) -> dict:
    """Quests store gameplay rules as JSON in events.rule_json. Examples:
    {"target": 5, "metric": "matches_won"}
    {"target": 60, "metric": "minutes_played",
     "reward": {"kind": "coins", "amount": 100, "label": "100 ggCoins"}}
    Tolerate malformed entries — never break the list endpoint over one
    bad row."""
    if not raw:
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except Exception:
        return {}


def _to_quest_out(event: Event, progress: EventProgress | None) -> QuestOut:
    rule = _parse_rule(getattr(event, "rule_json", None))
    reward = rule.get("reward") if isinstance(rule.get("reward"), dict) else {}
    return QuestOut(
        id=event.id,
        name=event.name,
        description=rule.get("description"),
        target=int(rule.get("target") or 1),
        progress=int(progress.progress) if progress else 0,
        completed=bool(progress.completed) if progress else False,
        claimed=bool(progress.completed) if progress else False,
        reward_label=reward.get("label"),
        reward_kind=reward.get("kind"),
        reward_amount=float(reward.get("amount") or 0),
        expires_at=getattr(event, "end_time", None),
    )


@router.get("/", response_model=list[QuestOut])
def list_quests(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Return every active quest for this user with their progress.

    Active = Event.active AND (end_time is null OR end_time > now).
    Quests with no per-user progress row yet show progress=0 / not
    completed — the kiosk can render them straight away without
    pre-creating EventProgress rows.
    """
    db = _open_db(ctx)
    try:
        now = datetime.utcnow()
        events = (
            db.query(Event)
            .filter(Event.type == "quest")
            .filter(Event.active.is_(True))
            .filter((Event.end_time.is_(None)) | (Event.end_time > now))
            .order_by(Event.id.desc())
            .all()
        )
        if not events:
            return []
        event_ids = [e.id for e in events]
        progress_rows = (
            db.query(EventProgress)
            .filter(
                EventProgress.event_id.in_(event_ids),
                EventProgress.user_id == current_user.id,
            )
            .all()
        )
        progress_by_event = {p.event_id: p for p in progress_rows}
        return [_to_quest_out(e, progress_by_event.get(e.id)) for e in events]
    finally:
        db.close()


@router.post("/{event_id}/claim", response_model=QuestOut)
def claim_quest(
    event_id: int,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Mark a quest as claimed once the user has reached the target.

    Returns the updated QuestOut (with completed=True/claimed=True) on
    success. Idempotent — claiming an already-completed quest returns
    the same row without error so the kiosk can re-issue the call on
    network retries.
    """
    db = _open_db(ctx)
    try:
        event = (
            db.query(Event)
            .filter(Event.id == event_id, Event.type == "quest")
            .first()
        )
        if not event:
            raise HTTPException(status_code=404, detail="Quest not found")

        progress = (
            db.query(EventProgress)
            .filter(
                EventProgress.event_id == event_id,
                EventProgress.user_id == current_user.id,
            )
            .first()
        )
        rule = _parse_rule(getattr(event, "rule_json", None))
        target = int(rule.get("target") or 1)

        if not progress:
            progress = EventProgress(
                event_id=event_id,
                user_id=current_user.id,
                progress=0,
                completed=False,
            )
            db.add(progress)

        if progress.completed:
            db.commit()
            return _to_quest_out(event, progress)

        if (progress.progress or 0) < target:
            raise HTTPException(
                status_code=400,
                detail=f"Quest not complete yet ({progress.progress or 0}/{target})",
            )

        progress.completed = True
        db.commit()
        db.refresh(progress)
        logger.info(
            "[QUEST CLAIM] user=%s event=%s reward=%s",
            current_user.id, event_id, rule.get("reward"),
        )
        return _to_quest_out(event, progress)
    finally:
        db.close()
