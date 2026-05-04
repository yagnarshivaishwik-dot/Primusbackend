"""Time-slot pricing rule management + quote endpoint.

Rules live in the per-café tenant database on the ``time_slot_pricing_rules``
table and are scoped by ``cafe_id`` (the global café id).

Deletion strategy: **hard delete**. The ``active`` flag is the soft-disable
path — callers should prefer ``active=false`` when a rule needs to be
temporarily suspended while preserving history. DELETE physically removes
the row.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.db.dependencies import get_cafe_db_by_id, get_global_db
from app.db.models_cafe import TimeSlotPricingRule
from app.models import Cafe
from app.schemas.pricing import (
    PricingRuleIn,
    PricingRuleList,
    PricingRuleOut,
    QuoteOut,
    QuoteSegment,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ensure_cafe_exists(cafe_id: int, global_db: Session) -> Cafe:
    cafe = global_db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    return cafe


def _parse_iso(dt_str: str, field: str) -> datetime:
    try:
        normalized = dt_str.replace("Z", "+00:00") if dt_str.endswith("Z") else dt_str
        dt = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field}: {exc}") from exc
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _cafe_session(cafe_id: int) -> tuple[Session, Iterable]:
    """Return (Session, generator) — caller must exhaust the generator in finally."""
    gen = get_cafe_db_by_id(cafe_id)
    session = next(gen)
    return session, gen


def _close_gen(gen: Iterable) -> None:
    try:
        next(gen)
    except StopIteration:
        pass


# ---------------------------------------------------------------------------
# Rule CRUD
# ---------------------------------------------------------------------------


@router.get("/cafe/{cafe_id}/rules", response_model=PricingRuleList)
def list_rules(
    cafe_id: int,
    include_inactive: bool = Query(False),
    global_db: Session = Depends(get_global_db),
) -> PricingRuleList:
    """List time-slot pricing rules for a café."""
    _ensure_cafe_exists(cafe_id, global_db)

    cafe_db, gen = _cafe_session(cafe_id)
    try:
        q = cafe_db.query(TimeSlotPricingRule).filter(
            TimeSlotPricingRule.cafe_id == cafe_id
        )
        if not include_inactive:
            q = q.filter(TimeSlotPricingRule.active.is_(True))
        rules = q.order_by(
            TimeSlotPricingRule.priority.desc(),
            TimeSlotPricingRule.day_of_week.asc(),
            TimeSlotPricingRule.start_minute.asc(),
        ).all()
        return PricingRuleList(
            items=[PricingRuleOut.model_validate(r) for r in rules],
            total=len(rules),
        )
    finally:
        _close_gen(gen)


@router.post("/cafe/{cafe_id}/rules", response_model=PricingRuleOut)
def create_rule(
    cafe_id: int,
    rule: PricingRuleIn,
    current_user=Depends(require_role("staff")),
    global_db: Session = Depends(get_global_db),
) -> PricingRuleOut:
    """Create a new time-slot pricing rule. Requires staff role or higher."""
    _ensure_cafe_exists(cafe_id, global_db)

    cafe_db, gen = _cafe_session(cafe_id)
    try:
        entity = TimeSlotPricingRule(
            cafe_id=cafe_id,
            day_of_week=rule.day_of_week,
            start_minute=rule.start_minute,
            end_minute=rule.end_minute,
            price_per_hour_paise=rule.price_per_hour_paise,
            pc_class=rule.pc_class,
            currency=rule.currency,
            priority=rule.priority,
            active=rule.active,
        )
        cafe_db.add(entity)
        cafe_db.commit()
        cafe_db.refresh(entity)
        return PricingRuleOut.model_validate(entity)
    finally:
        _close_gen(gen)


@router.put("/rule/{rule_id}", response_model=PricingRuleOut)
def update_rule(
    rule_id: int,
    rule: PricingRuleIn,
    cafe_id: int = Query(..., description="Café id hosting the rule (tenant router)"),
    current_user=Depends(require_role("staff")),
    global_db: Session = Depends(get_global_db),
) -> PricingRuleOut:
    """Update a rule. ``cafe_id`` query param is required to route to the tenant DB."""
    _ensure_cafe_exists(cafe_id, global_db)

    cafe_db, gen = _cafe_session(cafe_id)
    try:
        entity = (
            cafe_db.query(TimeSlotPricingRule)
            .filter(
                TimeSlotPricingRule.id == rule_id,
                TimeSlotPricingRule.cafe_id == cafe_id,
            )
            .first()
        )
        if not entity:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        for field in (
            "day_of_week",
            "start_minute",
            "end_minute",
            "price_per_hour_paise",
            "pc_class",
            "currency",
            "priority",
            "active",
        ):
            setattr(entity, field, getattr(rule, field))
        cafe_db.commit()
        cafe_db.refresh(entity)
        return PricingRuleOut.model_validate(entity)
    finally:
        _close_gen(gen)


@router.delete("/rule/{rule_id}")
def delete_rule(
    rule_id: int,
    cafe_id: int = Query(..., description="Café id hosting the rule (tenant router)"),
    current_user=Depends(require_role("staff")),
    global_db: Session = Depends(get_global_db),
) -> dict[str, str]:
    """
    Hard-delete a pricing rule.

    Use ``PUT /rule/{id}`` with ``active=false`` for a soft disable that
    preserves history.
    """
    _ensure_cafe_exists(cafe_id, global_db)

    cafe_db, gen = _cafe_session(cafe_id)
    try:
        entity = (
            cafe_db.query(TimeSlotPricingRule)
            .filter(
                TimeSlotPricingRule.id == rule_id,
                TimeSlotPricingRule.cafe_id == cafe_id,
            )
            .first()
        )
        if not entity:
            raise HTTPException(status_code=404, detail="Pricing rule not found")
        cafe_db.delete(entity)
        cafe_db.commit()
        return {"status": "deleted", "id": str(rule_id)}
    finally:
        _close_gen(gen)


# ---------------------------------------------------------------------------
# Quote
# ---------------------------------------------------------------------------


def _rule_specificity(rule: TimeSlotPricingRule) -> int:
    """More-specific rules win ties in priority. DOW set=+2, pc_class set=+1."""
    score = 0
    if rule.day_of_week is not None:
        score += 2
    if rule.pc_class is not None:
        score += 1
    return score


def _pick_rule(
    rules: list[TimeSlotPricingRule],
    dow: int,
    minute_of_day: int,
    pc_class: str | None,
) -> TimeSlotPricingRule | None:
    """Select the best matching rule for (dow, minute_of_day, pc_class).

    Rules are already filtered by café + active. The winner is the highest
    (priority, specificity) tuple among those that match all three axes.
    """
    candidates: list[TimeSlotPricingRule] = []
    for r in rules:
        if r.day_of_week is not None and r.day_of_week != dow:
            continue
        if r.pc_class is not None and r.pc_class != pc_class:
            continue
        if not (r.start_minute <= minute_of_day < r.end_minute):
            continue
        candidates.append(r)
    if not candidates:
        return None
    candidates.sort(key=lambda r: (r.priority, _rule_specificity(r)), reverse=True)
    return candidates[0]


@router.get("/cafe/{cafe_id}/quote", response_model=QuoteOut)
def quote(
    cafe_id: int,
    start: str = Query(..., description="ISO-8601 window start"),
    end: str = Query(..., description="ISO-8601 window end"),
    pc_class: str | None = Query(None, description="Target PC class; null=generic"),
    global_db: Session = Depends(get_global_db),
) -> QuoteOut:
    """
    Resolve the total price for a booking window.

    The algorithm walks the window minute-by-minute at a 1-minute resolution,
    groups consecutive minutes that are priced by the same rule into a
    contiguous ``QuoteSegment``, and sums the totals. This correctly spans
    both day boundaries and pricing-window boundaries without special cases.
    """
    _ensure_cafe_exists(cafe_id, global_db)

    window_start = _parse_iso(start, "start")
    window_end = _parse_iso(end, "end")
    if window_end <= window_start:
        raise HTTPException(status_code=400, detail="end must be after start")

    cafe_db, gen = _cafe_session(cafe_id)
    try:
        rules: list[TimeSlotPricingRule] = (
            cafe_db.query(TimeSlotPricingRule)
            .filter(
                TimeSlotPricingRule.cafe_id == cafe_id,
                TimeSlotPricingRule.active.is_(True),
            )
            .all()
        )

        # Walk every minute, recording the rule id that priced it (or None).
        # This handles day boundaries and overlapping pricing windows for free.
        one_min = timedelta(minutes=1)
        per_minute: list[tuple[datetime, TimeSlotPricingRule | None]] = []
        cur = window_start
        while cur < window_end:
            # Python's weekday(): Mon=0..Sun=6 matches our SmallInteger contract.
            dow = cur.weekday()
            mod = cur.hour * 60 + cur.minute
            per_minute.append((cur, _pick_rule(rules, dow, mod, pc_class)))
            cur = cur + one_min

        segments: list[QuoteSegment] = []
        total_minutes = 0
        total_paise = 0
        unpriced_minutes = 0

        def rule_key(r: TimeSlotPricingRule | None) -> int | None:
            return None if r is None else r.id

        # Group consecutive minutes sharing the same rule id into one segment.
        i = 0
        while i < len(per_minute):
            seg_start, seg_rule = per_minute[i]
            j = i + 1
            while j < len(per_minute) and rule_key(per_minute[j][1]) == rule_key(seg_rule):
                j += 1
            seg_end = (
                per_minute[j][0] if j < len(per_minute) else window_end
            )
            minutes = int((seg_end - seg_start).total_seconds() // 60)
            if seg_rule is None:
                unpriced_minutes += minutes
                segments.append(
                    QuoteSegment(
                        start=seg_start,
                        end=seg_end,
                        minutes=minutes,
                        price_per_hour_paise=0,
                        amount_paise=0,
                        rule_id=None,
                        pc_class=pc_class,
                    )
                )
            else:
                # Integer-money: (minutes * paise_per_hour) // 60 — no floats.
                amount = (minutes * seg_rule.price_per_hour_paise) // 60
                total_minutes += minutes
                total_paise += amount
                segments.append(
                    QuoteSegment(
                        start=seg_start,
                        end=seg_end,
                        minutes=minutes,
                        price_per_hour_paise=seg_rule.price_per_hour_paise,
                        amount_paise=amount,
                        rule_id=seg_rule.id,
                        pc_class=pc_class,
                    )
                )
            i = j

        # Currency: pick from any segment's rule; default INR.
        currency = "INR"
        for r in rules:
            if any(seg.rule_id == r.id for seg in segments):
                currency = r.currency or "INR"
                break

        return QuoteOut(
            cafe_id=cafe_id,
            start=window_start,
            end=window_end,
            pc_class=pc_class,
            currency=currency,
            total_minutes=total_minutes,
            total_paise=total_paise,
            segments=segments,
            unpriced_minutes=unpriced_minutes,
        )
    finally:
        _close_gen(gen)
