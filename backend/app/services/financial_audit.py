"""
Financial Audit Mirror service.

Records append-only audit entries in the global database for
every financial transaction that occurs in any cafe database.

CRITICAL: The platform_financial_audit table is append-only.
No UPDATE or DELETE is ever permitted.
"""

import json
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def record_audit_event(
    global_db: Session,
    cafe_id: int,
    txn_type: str,
    amount: Decimal | float,
    txn_ref: Optional[str] = None,
    user_id: Optional[int] = None,
    description: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """
    Write an append-only audit record to the global database.

    This function does NOT commit - the caller must commit as part
    of their transaction to ensure atomicity.

    Args:
        global_db: Session for the global database
        cafe_id: Cafe where the transaction occurred
        txn_type: Transaction type (wallet_topup, wallet_deduct, wallet_refund,
                  order, session_billing, subscription_payment, upi_payment)
        amount: Transaction amount
        txn_ref: Reference to the original transaction ID/key
        user_id: User who initiated the transaction
        description: Human-readable description
        metadata: Additional structured data
    """
    from app.db.models_global import PlatformFinancialAudit

    audit = PlatformFinancialAudit(
        cafe_id=cafe_id,
        txn_type=txn_type,
        amount=Decimal(str(amount)),
        txn_ref=txn_ref,
        user_id=user_id,
        description=description,
        metadata_=metadata,
    )
    global_db.add(audit)
    logger.debug(
        "Audit event queued: cafe=%d type=%s amount=%s user=%s",
        cafe_id, txn_type, amount, user_id,
    )


async def mirror_to_global_async(
    cafe_id: int,
    txn_type: str,
    amount: Decimal | float,
    txn_ref: Optional[str] = None,
    user_id: Optional[int] = None,
    description: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> bool:
    """
    Async version: writes audit record to global DB after cafe DB commit.

    If writing fails, queues to Redis for retry.

    Returns True if written successfully, False if queued for retry.
    """
    try:
        from app.db.global_db import global_session_factory

        global_db = global_session_factory()
        try:
            record_audit_event(
                global_db=global_db,
                cafe_id=cafe_id,
                txn_type=txn_type,
                amount=amount,
                txn_ref=txn_ref,
                user_id=user_id,
                description=description,
                metadata=metadata,
            )
            global_db.commit()
            return True
        except Exception:
            global_db.rollback()
            raise
        finally:
            global_db.close()

    except Exception:
        logger.warning("Audit mirror failed, queuing for retry", exc_info=True)
        await _enqueue_failed_audit(
            cafe_id=cafe_id,
            txn_type=txn_type,
            amount=str(amount),
            txn_ref=txn_ref,
            user_id=user_id,
            description=description,
            metadata=metadata,
        )
        return False


async def _enqueue_failed_audit(**kwargs) -> None:
    """Push failed audit record to Redis for later retry."""
    try:
        from app.utils.cache import get_redis
        redis = await get_redis()
        if redis:
            import os
            env = os.getenv("ENVIRONMENT", "development")
            queue_key = f"primus:{env}:failed_audit_queue"
            await redis.lpush(queue_key, json.dumps(kwargs, default=str))
            logger.info("Queued failed audit event for retry")
    except Exception:
        logger.error("Failed to queue audit event to Redis", exc_info=True)


async def retry_failed_audits(max_retries: int = 10) -> int:
    """
    Process failed audit events from Redis queue.

    Called by a background task. Returns number of successfully processed events.
    """
    try:
        from app.utils.cache import get_redis
        redis = await get_redis()
        if not redis:
            return 0

        import os
        env = os.getenv("ENVIRONMENT", "development")
        queue_key = f"primus:{env}:failed_audit_queue"

        processed = 0
        for _ in range(max_retries):
            raw = await redis.rpop(queue_key)
            if not raw:
                break

            data = json.loads(raw)

            try:
                from app.db.global_db import global_session_factory
                global_db = global_session_factory()
                try:
                    record_audit_event(
                        global_db=global_db,
                        cafe_id=data["cafe_id"],
                        txn_type=data["txn_type"],
                        amount=Decimal(data["amount"]),
                        txn_ref=data.get("txn_ref"),
                        user_id=data.get("user_id"),
                        description=data.get("description"),
                        metadata=data.get("metadata"),
                    )
                    global_db.commit()
                    processed += 1
                except Exception:
                    global_db.rollback()
                    # Re-queue on failure
                    await redis.lpush(queue_key, raw)
                    logger.warning("Retry failed for audit event, re-queued")
                    break
                finally:
                    global_db.close()
            except Exception:
                await redis.lpush(queue_key, raw)
                break

        if processed > 0:
            logger.info("Retried %d failed audit events", processed)
        return processed

    except Exception:
        logger.error("Failed to process audit retry queue", exc_info=True)
        return 0
