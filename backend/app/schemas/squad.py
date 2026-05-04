"""Pydantic schemas for squad (multi-PC) booking.

A squad booking is a single request to reserve N PCs in the same café
for the same time window, on behalf of a captain and N-1 members. The
``POST /api/v1/booking/squad`` endpoint owns the atomic lock fan-out
that guarantees either all child bookings land or none do.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


PaymentSplit = Literal["captain", "equal", "each"]


class SquadBookingIn(BaseModel):
    """Request payload for ``POST /api/v1/booking/squad``.

    - ``captain_id`` must match the authenticated user (enforced at the
      endpoint layer; re-sending here simplifies audit logs).
    - ``member_user_ids`` contains the non-captain members; must not
      include the captain and must be unique.
    - ``pc_ids`` is the set of PCs to reserve; must be unique + positive.
    - ``total_amount_paise`` is optional; when omitted the endpoint
      will TODO-compute via ``/pricing/quote`` per PC in a later pass.
    """

    cafe_id: int = Field(..., ge=1)
    captain_id: int = Field(..., ge=1)
    member_user_ids: list[int] = Field(default_factory=list)
    pc_ids: list[int] = Field(..., min_length=1, max_length=20)
    start_at: datetime
    end_at: datetime
    payment_split: PaymentSplit = "captain"
    total_amount_paise: int | None = Field(None, ge=0)
    currency: str = "INR"

    @model_validator(mode="after")
    def _check_invariants(self) -> "SquadBookingIn":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be strictly greater than start_at")
        if any(p <= 0 for p in self.pc_ids):
            raise ValueError("pc_ids must all be positive")
        if len(set(self.pc_ids)) != len(self.pc_ids):
            raise ValueError("pc_ids must be unique")
        if self.captain_id in self.member_user_ids:
            raise ValueError("captain_id must not appear in member_user_ids")
        if len(set(self.member_user_ids)) != len(self.member_user_ids):
            raise ValueError("member_user_ids must be unique")
        return self


class SquadChildBookingOut(BaseModel):
    id: int
    pc_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    status: str

    model_config = {"from_attributes": True}


class SquadBookingOut(BaseModel):
    id: int
    captain_id: int
    cafe_id: int
    status: str
    payment_split: PaymentSplit
    total_amount_paise: int
    currency: str
    created_at: datetime
    bookings: list[SquadChildBookingOut]

    model_config = {"from_attributes": True}
