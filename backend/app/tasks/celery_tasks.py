"""
Celery task definitions.

These wrap the existing task logic from presence.py, revenue_aggregation.py, etc.
so they can be run by Celery workers instead of asyncio background loops.

The asyncio loops in lifespan remain as fallback when Celery is not deployed.
Set USE_CELERY_TASKS=true to disable the in-process asyncio loops
(when Celery workers handle scheduling via beat).
"""

import logging
from datetime import UTC, date, datetime, timedelta

from app.celery_app import celery_app

logger = logging.getLogger("primus.tasks.celery")


@celery_app.task(bind=True, name="app.tasks.celery_tasks.revenue_aggregation_task")
def revenue_aggregation_task(self):
    """Celery wrapper for daily revenue aggregation."""
    from app.tasks.revenue_aggregation import _aggregate_cafe
    from app.db.global_db import global_session_factory
    from app.db.models_global import Cafe

    target_date = (datetime.now(UTC) - timedelta(days=1)).date()
    logger.info("Celery: starting revenue aggregation for %s", target_date)

    global_db = global_session_factory()
    try:
        cafe_ids = [c.id for c in global_db.query(Cafe).filter_by(db_provisioned=True).all()]
    finally:
        global_db.close()

    successes = 0
    failures = 0
    for cafe_id in cafe_ids:
        try:
            _aggregate_cafe(cafe_id, target_date)
            successes += 1
        except Exception as exc:
            logger.exception("Aggregation failed for cafe %d", cafe_id)
            failures += 1

    result = {
        "date": str(target_date),
        "cafes": len(cafe_ids),
        "successes": successes,
        "failures": failures,
    }
    logger.info("Celery: revenue aggregation complete — %s", result)
    return result


@celery_app.task(bind=True, name="app.tasks.celery_tasks.presence_monitor_task")
def presence_monitor_task(self):
    """
    Celery wrapper for presence monitoring.

    Note: This runs synchronously in a Celery worker. The WebSocket broadcast
    parts require an event loop, so we only do the DB-level status updates here.
    The WebSocket notifications are still handled by the in-process asyncio loop.
    """
    import json
    from app.db.global_db import global_session_factory
    from app.db.models_cafe import ClientPC, SystemEvent
    from app.db.models_global import Cafe
    from app.db.router import cafe_db_router

    logger.debug("Celery: presence monitor check")

    global_db = global_session_factory()
    try:
        cafe_ids = [c.id for c in global_db.query(Cafe).filter_by(db_provisioned=True).all()]
    finally:
        global_db.close()

    total_marked = 0
    for cafe_id in cafe_ids:
        cafe_db = cafe_db_router.get_session(cafe_id)
        try:
            threshold = datetime.now(UTC) - timedelta(seconds=45)
            stale_pcs = (
                cafe_db.query(ClientPC)
                .filter(ClientPC.status != "offline", ClientPC.last_seen < threshold)
                .all()
            )
            for pc in stale_pcs:
                pc.status = "offline"
                event = SystemEvent(
                    type="pc.status",
                    pc_id=pc.id,
                    payload={"status": "offline", "reason": "heartbeat_timeout"},
                )
                cafe_db.add(event)
                total_marked += 1
            if stale_pcs:
                cafe_db.commit()
        finally:
            cafe_db.close()

    if total_marked:
        logger.info("Celery: marked %d PCs offline across %d cafes", total_marked, len(cafe_ids))
    return {"marked_offline": total_marked}


@celery_app.task(bind=True, name="app.tasks.celery_tasks.refresh_materialized_views")
def refresh_materialized_views(self, cafe_id: int):
    """Refresh materialized views for a specific cafe."""
    from sqlalchemy import text
    from app.db.router import cafe_db_router

    db = cafe_db_router.get_session(cafe_id)
    try:
        db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_revenue"))
        db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_session_stats"))
        db.commit()
        logger.info("Refreshed materialized views for cafe %d", cafe_id)
    except Exception:
        db.rollback()
        logger.debug("Materialized view refresh failed for cafe %d (views may not exist)", cafe_id)
    finally:
        db.close()
