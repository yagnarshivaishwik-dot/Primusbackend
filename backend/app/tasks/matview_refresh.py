"""Phase 7 materialized-view refresh schedule.

Audit reference: master report Section E.1 (backend perf) +
alembic_cafe/versions/003_add_indexes_and_matviews.py which created the
matviews. Until now there was no code that refreshed them, so analytics
queries that read from the matviews returned stale data.

Schedule (set in celery_app beat_schedule):
  - reports_daily       every 5 minutes (CONCURRENTLY)
  - top_users_summary   every 5 minutes (CONCURRENTLY)
  - sales_series        every 60 seconds during cafe operating hours,
                        every 10 minutes otherwise

CONCURRENTLY means the matview is rebuilt without blocking SELECTs.
Postgres requires a unique index on the matview for CONCURRENTLY to work;
the migration that created each matview is responsible for that index.
"""

from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import text

from app.celery_app import celery_app
from app.db.router import cafe_db_router


logger = logging.getLogger("primus.matview")


# Matviews to refresh in every cafe DB. Add new entries when migrations
# create new matviews.
DEFAULT_MATVIEWS: tuple[str, ...] = (
    "reports_daily_mv",
    "top_users_summary_mv",
    "sales_series_mv",
)


def _list_active_cafes() -> list[int]:
    """Read the active cafe-ids from the global DB.

    Lazy import so this module can be loaded by Celery without dragging in
    the rest of the FastAPI app on initial import.
    """
    from app.db.dependencies import SessionGlobal
    from app.models import Cafe

    db = SessionGlobal()
    try:
        rows = (
            db.query(Cafe.id)
            .filter(Cafe.is_active.is_(True))
            .all()
        )
        return [r[0] for r in rows]
    finally:
        db.close()


def _refresh_one(cafe_id: int, matview: str) -> bool:
    """Run REFRESH MATERIALIZED VIEW CONCURRENTLY for a single matview.

    Falls back to a non-CONCURRENT refresh if the unique-index requirement
    is missing. Logs every failure but never raises — the next scheduled
    run will try again.
    """
    sess = cafe_db_router.get_session(cafe_id)
    try:
        try:
            sess.execute(text(f'REFRESH MATERIALIZED VIEW CONCURRENTLY "{matview}"'))
            sess.commit()
            return True
        except Exception as exc:
            sess.rollback()
            msg = str(exc).lower()
            if "concurrently" in msg or "unique index" in msg:
                # Fallback: non-concurrent refresh. Briefly blocks selects.
                logger.warning(
                    "matview: %s refresh CONCURRENTLY rejected (cafe=%d); "
                    "falling back to plain refresh: %s",
                    matview, cafe_id, exc,
                )
                try:
                    sess.execute(text(f'REFRESH MATERIALIZED VIEW "{matview}"'))
                    sess.commit()
                    return True
                except Exception as exc2:
                    sess.rollback()
                    logger.error(
                        "matview: %s refresh failed (cafe=%d): %s",
                        matview, cafe_id, exc2,
                    )
                    return False
            logger.error(
                "matview: %s refresh failed (cafe=%d): %s",
                matview, cafe_id, exc,
            )
            return False
    finally:
        sess.close()


@celery_app.task(
    name="primus.matview.refresh_all",
    queue="periodic",
    soft_time_limit=600,
    time_limit=900,
)
def refresh_all_matviews(matviews: Iterable[str] = DEFAULT_MATVIEWS) -> dict:
    """Refresh every named matview across every active cafe.

    Returns a small dict summary so beat schedule logs are useful.
    """
    matviews = tuple(matviews)
    cafes = _list_active_cafes()

    ok = 0
    fail = 0
    for cafe_id in cafes:
        for mv in matviews:
            if _refresh_one(cafe_id, mv):
                ok += 1
            else:
                fail += 1

    logger.info(
        "matview: refresh pass complete (cafes=%d, matviews=%d, ok=%d, fail=%d)",
        len(cafes), len(matviews), ok, fail,
    )
    return {
        "cafes": len(cafes),
        "matviews": len(matviews),
        "ok": ok,
        "fail": fail,
    }


# --- Beat schedule wiring --------------------------------------------------
#
# Add this to app/celery_app.py beat_schedule:
#
#   from celery.schedules import crontab
#   beat_schedule = {
#       "refresh-matviews-fast": {
#           "task": "primus.matview.refresh_all",
#           "schedule": 300.0,  # every 5 minutes
#           "args": [["reports_daily_mv", "top_users_summary_mv"]],
#       },
#       "refresh-matviews-realtime": {
#           "task": "primus.matview.refresh_all",
#           "schedule": 60.0,   # every minute
#           "args": [["sales_series_mv"]],
#       },
#   }
#
# Operators who want the "operating-hours-only" version can replace the
# 60s entry with crontab(minute='*', hour='9-23') etc.
