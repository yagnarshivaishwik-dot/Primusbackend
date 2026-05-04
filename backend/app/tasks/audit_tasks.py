"""Celery audit-log writer.

Phase 4 (audit master report Section F.6 / D.6 step 7):
  When AUDIT_LOG_ASYNC=true, app.api.endpoints.audit.log_action enqueues
  this task instead of writing inline. The task opens its own DB session
  and goes through the same _persist_sync helper, so the HMAC chain is
  computed in Celery (not by the request thread).

  If Celery is unavailable, log_action transparently falls back to a sync
  write, so this module is purely an optimization — never a correctness
  dependency.
"""

from __future__ import annotations

import logging

from app.celery_app import celery_app
from app.db.dependencies import SessionGlobal


logger = logging.getLogger("primus.audit.tasks")


@celery_app.task(
    name="primus.audit.write_audit_log",
    queue="default",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    retry_jitter=True,
    max_retries=5,
    acks_late=True,
)
def write_audit_log_task(
    *,
    user_id: int | None,
    action: str,
    detail: str | None,
    ip: str | None,
    cafe_id: int | None,
    device_id: str | None,
) -> None:
    """Write a single audit-log row from a worker.

    The same canonical-payload + HMAC-chain logic as the sync path lives in
    audit.py:_persist_sync. We import locally so the worker doesn't pull
    the FastAPI router module unless this task fires.
    """
    from app.api.endpoints.audit import _persist_sync

    db = SessionGlobal()
    try:
        ok = _persist_sync(
            db,
            user_id=user_id,
            action=action,
            detail=detail,
            ip=ip,
            cafe_id=cafe_id,
            device_id=device_id,
        )
        if not ok:
            # Raising triggers Celery's retry. _persist_sync itself logs
            # the error so the next attempt has context.
            raise RuntimeError(f"audit-log persist failed for action={action!r}")
    finally:
        db.close()
