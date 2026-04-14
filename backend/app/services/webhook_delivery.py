"""
Outbound webhook delivery service.

Cafe owners can register webhook URLs for events (session_start, session_end,
wallet_topup, new_user, etc.). This service delivers signed payloads with
retry logic using exponential backoff.

Usage:
    from app.services.webhook_delivery import dispatch_webhook

    # Fire-and-forget (async)
    await dispatch_webhook(cafe_id, "session.started", {"user_id": 1, "pc_id": 5})

    # Or via Celery (when USE_CELERY_TASKS=true)
    deliver_webhook_task.delay(cafe_id, "session.started", {...})
"""

import hashlib
import hmac
import json
import logging
import time
from datetime import UTC, datetime

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger("primus.services.webhook_delivery")

# Events that can trigger outbound webhooks
SUPPORTED_EVENTS = {
    "session.started",
    "session.ended",
    "wallet.topup",
    "wallet.deduct",
    "user.created",
    "user.updated",
    "order.completed",
    "pc.status.online",
    "pc.status.offline",
    "booking.created",
    "booking.confirmed",
    "booking.cancelled",
    "payment.completed",
    "payment.failed",
}

# Retry schedule: [delay_seconds_after_attempt_1, ..., delay_after_attempt_N]
RETRY_DELAYS = [10, 30, 120, 600]  # 10s, 30s, 2m, 10m
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1  # 1 initial + 4 retries = 5 total
DELIVERY_TIMEOUT = 10.0  # seconds


def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    """Generate HMAC-SHA256 signature for webhook payload."""
    return hmac.new(
        secret.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()


def _get_active_webhooks(cafe_db: Session, event: str) -> list:
    """Get all active webhooks for an event type in a cafe DB."""
    from app.db.models_cafe import Webhook

    return (
        cafe_db.query(Webhook)
        .filter(
            Webhook.is_active == True,  # noqa: E712
            (Webhook.event == event) | (Webhook.event == "*"),
        )
        .all()
    )


async def dispatch_webhook(
    cafe_id: int,
    event: str,
    data: dict,
    *,
    source: str = "primus",
) -> list[dict]:
    """
    Dispatch a webhook event to all registered URLs for a cafe.

    Args:
        cafe_id: The cafe database to look up webhooks in.
        event: Event type (e.g., "session.started").
        data: Event payload data.
        source: Source identifier for the webhook.

    Returns:
        List of delivery result dicts.
    """
    if event not in SUPPORTED_EVENTS:
        logger.warning("Unsupported webhook event: %s", event)
        return []

    from app.db.router import cafe_db_router

    cafe_db = cafe_db_router.get_session(cafe_id)
    try:
        webhooks = _get_active_webhooks(cafe_db, event)
    finally:
        cafe_db.close()

    if not webhooks:
        return []

    payload = {
        "event": event,
        "data": data,
        "timestamp": datetime.now(UTC).isoformat(),
        "source": source,
        "cafe_id": cafe_id,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), default=str).encode()

    results = []
    for wh in webhooks:
        result = await _deliver_single(wh.url, wh.secret, payload_bytes, wh.id)
        results.append(result)

    return results


async def _deliver_single(
    url: str,
    secret: str | None,
    payload_bytes: bytes,
    webhook_id: int,
) -> dict:
    """Deliver a single webhook with retries."""
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Primus-Webhook/1.0",
        "X-Webhook-ID": str(webhook_id),
        "X-Webhook-Timestamp": str(int(time.time())),
    }

    if secret:
        signature = _sign_payload(payload_bytes, secret)
        headers["X-Webhook-Signature"] = f"sha256={signature}"

    for attempt in range(MAX_ATTEMPTS):
        try:
            async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT) as client:
                response = await client.post(url, content=payload_bytes, headers=headers)

            if 200 <= response.status_code < 300:
                logger.info(
                    "Webhook %d delivered to %s (attempt %d, status %d)",
                    webhook_id, url, attempt + 1, response.status_code,
                )
                return {
                    "webhook_id": webhook_id,
                    "url": url,
                    "status": "delivered",
                    "status_code": response.status_code,
                    "attempts": attempt + 1,
                }

            logger.warning(
                "Webhook %d to %s returned %d (attempt %d/%d)",
                webhook_id, url, response.status_code, attempt + 1, MAX_ATTEMPTS,
            )

        except Exception as exc:
            logger.warning(
                "Webhook %d to %s failed (attempt %d/%d): %s",
                webhook_id, url, attempt + 1, MAX_ATTEMPTS, exc,
            )

        # Wait before retry (if not last attempt)
        if attempt < len(RETRY_DELAYS):
            import asyncio

            await asyncio.sleep(RETRY_DELAYS[attempt])

    logger.error(
        "Webhook %d to %s failed after %d attempts — giving up",
        webhook_id, url, MAX_ATTEMPTS,
    )
    return {
        "webhook_id": webhook_id,
        "url": url,
        "status": "failed",
        "attempts": MAX_ATTEMPTS,
    }


# ── Convenience dispatchers for common events ──────────────────────


async def on_session_started(cafe_id: int, user_id: int, pc_id: int, session_id: int):
    """Fire webhook for session start."""
    await dispatch_webhook(cafe_id, "session.started", {
        "session_id": session_id,
        "user_id": user_id,
        "pc_id": pc_id,
    })


async def on_session_ended(cafe_id: int, user_id: int, pc_id: int, session_id: int, amount: float):
    """Fire webhook for session end."""
    await dispatch_webhook(cafe_id, "session.ended", {
        "session_id": session_id,
        "user_id": user_id,
        "pc_id": pc_id,
        "amount": amount,
    })


async def on_wallet_topup(cafe_id: int, user_id: int, amount: float):
    """Fire webhook for wallet topup."""
    await dispatch_webhook(cafe_id, "wallet.topup", {
        "user_id": user_id,
        "amount": amount,
    })


async def on_user_created(cafe_id: int, user_id: int, email: str):
    """Fire webhook for new user registration."""
    await dispatch_webhook(cafe_id, "user.created", {
        "user_id": user_id,
        "email": email,
    })
