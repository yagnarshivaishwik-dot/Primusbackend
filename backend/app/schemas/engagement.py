from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


# Prizes
class PrizeIn(BaseModel):
    name: str
    description: str | None = None
    coin_cost: int
    stock: int


class PrizeOut(PrizeIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class PrizeRedemptionOut(BaseModel):
    id: int
    user_id: int
    prize_id: int
    timestamp: datetime
    status: str
    model_config = ConfigDict(from_attributes=True)


# Coupons
class CouponIn(BaseModel):
    code: str
    discount_percent: float = 0.0
    max_uses: int | None = None
    per_user_limit: int | None = None
    expires_at: datetime | None = None
    applies_to: str = "*"


class CouponOut(CouponIn):
    id: int
    times_used: int
    model_config = ConfigDict(from_attributes=True)


class CouponRedeemIn(BaseModel):
    code: str
    target: str
    offer_id: int | None = None
    product_id: int | None = None


class CouponRedemptionOut(BaseModel):
    id: int
    coupon_id: int
    user_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


# Leaderboards
class LeaderboardIn(BaseModel):
    name: str
    scope: str = "daily"
    metric: str = "play_minutes"


class LeaderboardOut(LeaderboardIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class LeaderboardEntryOut(BaseModel):
    id: int
    leaderboard_id: int
    user_id: int
    period_start: datetime
    period_end: datetime
    value: int
    model_config = ConfigDict(from_attributes=True)


# Events
class EventIn(BaseModel):
    name: str
    type: str
    rule_json: str
    start_time: datetime
    end_time: datetime


class EventOut(EventIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class EventProgressOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    progress: int
    completed: bool
    model_config = ConfigDict(from_attributes=True)


_HHMM_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


def _validate_hhmm(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    import re as _re
    if not _re.match(_HHMM_RE, v):
        raise ValueError("must be HH:MM (00:00..23:59)")
    return v


# Offers
class OfferIn(BaseModel):
    name: str
    description: str | None = None
    price: float
    hours_minutes: int
    # Inventory v2 — all optional with safe defaults so existing callers keep
    # working without changes.
    thumbnail_url: str | None = None
    bonus_minutes: int = 0
    discount_percent: float = 0.0
    tax_percent: float = 0.0
    display_order: int = 0
    is_happy_hour_only: bool = False
    happy_hour_start: str | None = None  # "HH:MM"
    happy_hour_end: str | None = None    # "HH:MM"

    @field_validator("happy_hour_start", "happy_hour_end")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        return _validate_hhmm(v)


class OfferUpdate(BaseModel):
    """All fields optional — PATCH semantics."""
    name: str | None = None
    description: str | None = None
    price: float | None = None
    hours_minutes: int | None = None
    thumbnail_url: str | None = None
    bonus_minutes: int | None = None
    discount_percent: float | None = None
    tax_percent: float | None = None
    display_order: int | None = None
    is_happy_hour_only: bool | None = None
    happy_hour_start: str | None = None
    happy_hour_end: str | None = None
    active: bool | None = None

    @field_validator("happy_hour_start", "happy_hour_end")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        return _validate_hhmm(v)


class OfferOut(OfferIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class OfferReorderItem(BaseModel):
    id: int
    display_order: int


class UserOfferOut(BaseModel):
    id: int
    user_id: int
    offer_id: int | None = None
    purchased_at: datetime
    minutes_remaining: int
    model_config = ConfigDict(from_attributes=True)
