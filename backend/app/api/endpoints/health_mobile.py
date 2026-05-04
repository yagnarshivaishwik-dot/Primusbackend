"""Mobile-app health + upgrade-gate endpoint.

Exposes a single unauthenticated probe the Primus mobile app hits on cold
start to decide whether it needs to force-update the user to a newer
release or show a maintenance banner.

The returned version floors are source-of-truth for the app's gating UI;
bumping ``force_update_below`` here instantly locks out older clients
once they next reach the network.
"""

from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class MobileHealthResponse(BaseModel):
    """Gating payload consumed by the Primus mobile app on startup.

    Attributes:
        min_required_version: semver below which the app should refuse to
            proceed and prompt the user to update. Clients at or above this
            value are allowed.
        force_update_below: semver threshold below which the app MUST
            block all screens and show a hard update-now prompt. Typically
            set just below the oldest version with a critical fix.
        maintenance: when true, every screen should render a maintenance
            placeholder. Auth, booking, and payments must be blocked.
        message: optional operator-visible message surfaced to the app.
        server_time: RFC 3339 timestamp used by the app to detect clock
            skew and surface diagnostics in support tickets.
    """

    min_required_version: str
    force_update_below: str
    maintenance: bool
    message: str | None = None
    server_time: str


def _env_version(key: str, default: str) -> str:
    raw = (os.getenv(key) or "").strip()
    return raw or default


@router.get(
    "/mobile",
    response_model=MobileHealthResponse,
    summary="Mobile app health + upgrade gate",
    tags=["v1-health-mobile"],
)
async def mobile_health() -> MobileHealthResponse:
    """Return mobile gating and maintenance flags.

    Values are sourced from environment variables so operations can
    roll the gate without a deploy:

    - ``MOBILE_MIN_REQUIRED_VERSION`` (default ``"1.0.0"``)
    - ``MOBILE_FORCE_UPDATE_BELOW`` (default ``"0.9.0"``)
    - ``MOBILE_MAINTENANCE`` (truthy strings: ``"true"``, ``"1"``, ``"yes"``)
    - ``MOBILE_MAINTENANCE_MESSAGE`` (optional free-text)
    """

    from datetime import UTC, datetime

    maintenance_raw = (os.getenv("MOBILE_MAINTENANCE") or "").strip().lower()
    maintenance = maintenance_raw in {"1", "true", "yes", "on"}

    return MobileHealthResponse(
        min_required_version=_env_version("MOBILE_MIN_REQUIRED_VERSION", "1.0.0"),
        force_update_below=_env_version("MOBILE_FORCE_UPDATE_BELOW", "0.9.0"),
        maintenance=maintenance,
        message=(os.getenv("MOBILE_MAINTENANCE_MESSAGE") or None),
        server_time=datetime.now(UTC).isoformat(),
    )
