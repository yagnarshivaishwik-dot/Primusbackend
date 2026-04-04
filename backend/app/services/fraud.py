"""
Fraud Detection Service.

Redis-based velocity checks for financial transactions.
All checks are non-blocking: if Redis is unavailable, checks are skipped
to avoid impacting legitimate transactions (fail-open for availability).

Velocity windows use Redis Sorted Sets (ZSET) with timestamps as scores.
Keys expire automatically after the longest window (1 hour).

Thresholds (configurable via environment variables):
  FRAUD_MAX_TOPUPS_PER_HOUR      - max wallet topups per user per hour (default: 10)
  FRAUD_MAX_TOPUP_AMOUNT_1H      - max cumulative topup amount per hour (default: 50000)
  FRAUD_MAX_DEDUCTS_PER_HOUR     - max deductions per user per hour (default: 20)
  FRAUD_MAX_IP_TXNS_PER_MINUTE   - max transactions from one IP per minute (default: 30)
  FRAUD_DRAIN_RATIO_THRESHOLD    - topup→drain ratio alerting threshold (default: 0.95)
"""

import logging
import os
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

logger = logging.getLogger("primus.services.fraud")

# ---- Configurable thresholds ----

MAX_TOPUPS_PER_HOUR = int(os.getenv("FRAUD_MAX_TOPUPS_PER_HOUR", "10"))
MAX_TOPUP_AMOUNT_1H = Decimal(os.getenv("FRAUD_MAX_TOPUP_AMOUNT_1H", "50000"))
MAX_DEDUCTS_PER_HOUR = int(os.getenv("FRAUD_MAX_DEDUCTS_PER_HOUR", "20"))
MAX_IP_TXNS_PER_MINUTE = int(os.getenv("FRAUD_MAX_IP_TXNS_PER_MINUTE", "30"))
DRAIN_RATIO_THRESHOLD = float(os.getenv("FRAUD_DRAIN_RATIO_THRESHOLD", "0.95"))
WINDOW_1H = 3600
WINDOW_1M = 60


@dataclass
class FraudCheckResult:
    allowed: bool
    reason: str | None = None
    risk_score: int = 0  # 0–100

    def __bool__(self):
        return self.allowed


async def check_topup(
    user_id: int,
    cafe_id: int,
    amount: Decimal,
    client_ip: Optional[str] = None,
) -> FraudCheckResult:
    """
    Run fraud checks before a wallet top-up.
    Returns FraudCheckResult.allowed=False to block the transaction.
    """
    try:
        redis = await _get_redis()
        if redis is None:
            return FraudCheckResult(allowed=True)

        now = time.time()
        risk_score = 0
        env = os.getenv("ENVIRONMENT", "development")

        # --- Check 1: Topup frequency per user ---
        freq_key = f"primus:{env}:fraud:topup_freq:{cafe_id}:{user_id}"
        count = await _zset_add_and_count(redis, freq_key, now, WINDOW_1H)
        if count > MAX_TOPUPS_PER_HOUR:
            logger.warning(
                "FRAUD: Topup frequency exceeded for user %d cafe %d: %d/hr",
                user_id, cafe_id, count,
            )
            return FraudCheckResult(
                allowed=False,
                reason="Too many top-ups in a short period. Please try again later.",
                risk_score=90,
            )
        risk_score += min(30, int((count / MAX_TOPUPS_PER_HOUR) * 30))

        # --- Check 2: Cumulative topup amount per hour ---
        amt_key = f"primus:{env}:fraud:topup_amount:{cafe_id}:{user_id}"
        cumulative = await _cumulative_in_window(redis, amt_key, now, WINDOW_1H, float(amount))
        if Decimal(str(cumulative)) > MAX_TOPUP_AMOUNT_1H:
            logger.warning(
                "FRAUD: Topup amount limit exceeded for user %d cafe %d: %.2f in 1h",
                user_id, cafe_id, cumulative,
            )
            return FraudCheckResult(
                allowed=False,
                reason="Top-up amount limit reached for this period.",
                risk_score=85,
            )
        risk_score += min(30, int((float(Decimal(str(cumulative)) / MAX_TOPUP_AMOUNT_1H)) * 30))

        # --- Check 3: IP velocity ---
        if client_ip:
            ip_result = await _check_ip_velocity(redis, client_ip, env, now)
            if not ip_result.allowed:
                return ip_result
            risk_score += ip_result.risk_score

        # --- Check 4: Topup→drain pattern (alert only, don't block) ---
        await _check_drain_pattern(redis, user_id, cafe_id, env, now)

        return FraudCheckResult(allowed=True, risk_score=risk_score)

    except Exception:
        logger.warning("Fraud check error (fail-open)", exc_info=True)
        return FraudCheckResult(allowed=True)


async def check_deduct(
    user_id: int,
    cafe_id: int,
    amount: Decimal,
    client_ip: Optional[str] = None,
) -> FraudCheckResult:
    """
    Run fraud checks before a wallet deduction.
    """
    try:
        redis = await _get_redis()
        if redis is None:
            return FraudCheckResult(allowed=True)

        now = time.time()
        risk_score = 0
        env = os.getenv("ENVIRONMENT", "development")

        # --- Check 1: Deduction frequency per user ---
        freq_key = f"primus:{env}:fraud:deduct_freq:{cafe_id}:{user_id}"
        count = await _zset_add_and_count(redis, freq_key, now, WINDOW_1H)
        if count > MAX_DEDUCTS_PER_HOUR:
            logger.warning(
                "FRAUD: Deduction frequency exceeded for user %d cafe %d: %d/hr",
                user_id, cafe_id, count,
            )
            return FraudCheckResult(
                allowed=False,
                reason="Too many deductions in a short period. Please try again later.",
                risk_score=80,
            )
        risk_score += min(20, int((count / MAX_DEDUCTS_PER_HOUR) * 20))

        # --- Check 2: IP velocity ---
        if client_ip:
            ip_result = await _check_ip_velocity(redis, client_ip, env, now)
            if not ip_result.allowed:
                return ip_result
            risk_score += ip_result.risk_score

        return FraudCheckResult(allowed=True, risk_score=risk_score)

    except Exception:
        logger.warning("Fraud check error (fail-open)", exc_info=True)
        return FraudCheckResult(allowed=True)


async def record_upi_attempt(
    user_id: int,
    cafe_id: int,
    amount: Decimal,
    client_ip: Optional[str] = None,
) -> FraudCheckResult:
    """Check fraud before UPI payment intent creation."""
    # UPI topups use same thresholds as wallet topups
    return await check_topup(user_id, cafe_id, amount, client_ip)


# ---- Internal helpers ----

async def _get_redis():
    try:
        from app.utils.cache import get_redis
        return await get_redis()
    except Exception:
        return None


async def _zset_add_and_count(redis, key: str, now: float, window: int) -> int:
    """
    Add current timestamp to a sorted set, prune old entries,
    return count of entries within the window.
    """
    pipe = redis.pipeline()
    # Remove entries outside the window
    pipe.zremrangebyscore(key, 0, now - window)
    # Add current entry (score = timestamp, member = unique timestamp string)
    pipe.zadd(key, {str(now): now})
    # Count entries in window
    pipe.zcard(key)
    # Expire key after window + buffer
    pipe.expire(key, window + 60)
    results = await pipe.execute()
    return results[2]  # zcard result


async def _cumulative_in_window(
    redis, key: str, now: float, window: int, new_value: float
) -> float:
    """
    Track cumulative amount in a window using a sorted set where
    members encode the amount and score = timestamp.
    """
    pipe = redis.pipeline()
    # Remove old entries
    pipe.zremrangebyscore(key, 0, now - window)
    # Add new entry: member = "amount:unique_ts", score = now
    member = f"{new_value}:{now}"
    pipe.zadd(key, {member: now})
    # Fetch all members in window
    pipe.zrange(key, 0, -1)
    pipe.expire(key, window + 60)
    results = await pipe.execute()

    members = results[2]
    total = 0.0
    for m in members:
        try:
            val = float(m.split(":")[0]) if isinstance(m, str) else float(m.decode().split(":")[0])
            total += val
        except (ValueError, IndexError):
            pass
    return total


async def _check_ip_velocity(redis, client_ip: str, env: str, now: float) -> FraudCheckResult:
    """Block IPs exceeding per-minute transaction rate."""
    ip_key = f"primus:{env}:fraud:ip_txns:{client_ip}"
    count = await _zset_add_and_count(redis, ip_key, now, WINDOW_1M)
    if count > MAX_IP_TXNS_PER_MINUTE:
        logger.warning("FRAUD: IP velocity exceeded for %s: %d/min", client_ip, count)
        return FraudCheckResult(
            allowed=False,
            reason="Too many requests. Please slow down.",
            risk_score=95,
        )
    risk_score = min(20, int((count / MAX_IP_TXNS_PER_MINUTE) * 20))
    return FraudCheckResult(allowed=True, risk_score=risk_score)


async def _check_drain_pattern(
    redis, user_id: int, cafe_id: int, env: str, now: float
) -> None:
    """
    Detect topup→immediate drain pattern: alert (but don't block).
    High-risk pattern: user tops up then drains >95% within 5 minutes.
    """
    try:
        drain_key = f"primus:{env}:fraud:drain_watch:{cafe_id}:{user_id}"
        # This is a heuristic alert — just log and set a flag for manual review
        existing = await redis.get(drain_key)
        if existing:
            ratio = float(existing)
            if ratio >= DRAIN_RATIO_THRESHOLD:
                logger.warning(
                    "FRAUD ALERT: Topup→drain pattern detected for user %d cafe %d (ratio=%.2f)",
                    user_id, cafe_id, ratio,
                )
    except Exception:
        pass


async def update_drain_ratio(
    user_id: int, cafe_id: int, topup_amount: float, deduct_amount: float
) -> None:
    """Called after each deduction to update the drain ratio tracker."""
    try:
        redis = await _get_redis()
        if redis is None:
            return

        env = os.getenv("ENVIRONMENT", "development")
        if topup_amount > 0:
            ratio = min(deduct_amount / topup_amount, 1.0)
            drain_key = f"primus:{env}:fraud:drain_watch:{cafe_id}:{user_id}"
            await redis.setex(drain_key, 300, str(ratio))  # 5-minute window
    except Exception:
        pass
