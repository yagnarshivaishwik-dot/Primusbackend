from datetime import datetime

from pydantic import BaseModel, ConfigDict


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


# Offers
class OfferIn(BaseModel):
    name: str
    description: str | None = None
    price: float
    hours_minutes: int


class OfferOut(OfferIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class UserOfferOut(BaseModel):
    id: int
    user_id: int
    offer_id: int
    purchased_at: datetime
    minutes_remaining: int
    model_config = ConfigDict(from_attributes=True)
