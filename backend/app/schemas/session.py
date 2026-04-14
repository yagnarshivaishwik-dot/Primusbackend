from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SessionStart(BaseModel):
    pc_id: int
    user_id: int


class SessionOut(BaseModel):
    id: int
    pc_id: int
    user_id: int
    start_time: datetime
    end_time: datetime | None
    paid: bool
    amount: float
    model_config = ConfigDict(from_attributes=True)


class BookingIn(BaseModel):
    pc_id: int
    start_time: datetime
    end_time: datetime


class BookingOut(BookingIn):
    id: int
    user_id: int
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
