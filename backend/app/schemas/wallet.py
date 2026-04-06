from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WalletTransactionOut(BaseModel):
    id: int
    user_id: int
    amount: float
    timestamp: datetime
    type: str
    description: str | None
    model_config = ConfigDict(from_attributes=True)


class WalletAction(BaseModel):
    amount: float
    type: str
    description: str | None = None
    user_id: int | None = None


class CoinTransactionOut(BaseModel):
    id: int
    user_id: int
    amount: int
    timestamp: datetime
    reason: str | None = None
    model_config = ConfigDict(from_attributes=True)


class PricingRuleIn(BaseModel):
    name: str
    rate_per_hour: float
    group_id: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None


class PricingRuleOut(PricingRuleIn):
    id: int
    is_active: bool
    model_config = ConfigDict(from_attributes=True)
