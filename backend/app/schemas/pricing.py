"""Pydantic schemas for time-slot pricing rules and price quotes.

Money values are integer paise (minor currency units). Time windows within
a day are represented as minutes-since-midnight in the café's local timezone.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PricingRuleIn(BaseModel):
    """Create/update payload for a TimeSlotPricingRule."""

    day_of_week: int | None = Field(None, ge=0, le=6, description="0=Mon..6=Sun; null=all days")
    start_minute: int = Field(..., ge=0, le=1439, description="Window start (minutes from 00:00 local)")
    end_minute: int = Field(..., ge=1, le=1440, description="Window end (exclusive)")
    price_per_hour_paise: int = Field(..., ge=0, description="Price per hour in paise (integer money)")
    pc_class: str | None = Field(None, description="PC class scope, e.g. 'standard'|'gaming'|'vr'; null=all")
    currency: str = Field("INR", min_length=3, max_length=3)
    priority: int = Field(0, description="Higher wins on overlap")
    active: bool = True

    @field_validator("end_minute")
    @classmethod
    def _end_gt_start(cls, v: int, info) -> int:
        start = info.data.get("start_minute")
        if start is not None and v <= start:
            raise ValueError("end_minute must be greater than start_minute")
        return v


class PricingRuleOut(PricingRuleIn):
    id: int
    cafe_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PricingRuleList(BaseModel):
    items: list[PricingRuleOut]
    total: int


# ---- Quote shapes ----


class QuoteSegment(BaseModel):
    """A single billed slice inside the overall quote window."""

    start: datetime
    end: datetime
    minutes: int
    price_per_hour_paise: int
    amount_paise: int
    rule_id: int | None = None
    pc_class: str | None = None


class QuoteOut(BaseModel):
    cafe_id: int
    start: datetime
    end: datetime
    pc_class: str | None = None
    currency: str = "INR"
    total_minutes: int
    total_paise: int
    segments: list[QuoteSegment]
    unpriced_minutes: int = 0  # minutes with no matching rule
