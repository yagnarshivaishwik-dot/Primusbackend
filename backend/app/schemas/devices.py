"""Pydantic schemas for mobile device push-token management."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# Platform accepted by the device registry. Keep in sync with the column
# constraint check performed at the endpoint layer.
DevicePlatform = Literal["ios", "android"]


class DeviceTokenIn(BaseModel):
    """Request body for POST /api/devices/register."""

    token: str = Field(..., min_length=1, max_length=4096)
    platform: DevicePlatform
    app_version: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=32)


class DeviceHeartbeatIn(BaseModel):
    """Request body for POST /api/devices/heartbeat."""

    token: str = Field(..., min_length=1, max_length=4096)


class DeviceTokenOut(BaseModel):
    """Response shape for a registered device."""

    id: int
    user_id: int
    token: str
    platform: str
    app_version: str | None = None
    locale: str | None = None
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "DeviceHeartbeatIn",
    "DevicePlatform",
    "DeviceTokenIn",
    "DeviceTokenOut",
]
