"""Pydantic schemas for the social graph (friends, teams)."""
from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


# ---- Friendship ------------------------------------------------------------

class FriendRequestIn(BaseModel):
    addressee_id: int = Field(..., gt=0)


class FriendOut(BaseModel):
    id: int
    user_id: int          # the *other* user (not me)
    user_name: str | None = None
    user_email: str | None = None
    status: str           # pending | accepted
    direction: str        # outgoing | incoming
    created_at: datetime
    accepted_at: datetime | None = None

    model_config = {"from_attributes": True}


# ---- Teams -----------------------------------------------------------------

class TeamCreateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    tag: str | None = Field(None, max_length=8)
    avatar_url: str | None = None


class TeamMemberOut(BaseModel):
    user_id: int
    user_name: str | None = None
    role: str
    joined_at: datetime | None = None

    model_config = {"from_attributes": True}


class TeamOut(BaseModel):
    id: int
    name: str
    tag: str | None = None
    owner_id: int
    avatar_url: str | None = None
    created_at: datetime
    members: list[TeamMemberOut] = []

    model_config = {"from_attributes": True}


class TeamInviteIn(BaseModel):
    user_id: int = Field(..., gt=0)
