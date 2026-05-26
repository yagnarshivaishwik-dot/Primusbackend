"""
Primus observability package.

Top-level entry point that bundles:
    - tracing.py  -> OpenTelemetry (FastAPI, SQLAlchemy, Redis, Celery, HTTPX)
    - metrics.py  -> Prometheus client metrics + middleware
    - sentry.py   -> Sentry SDK init with FastAPI integration

Wire all three from `app/main.py`::

    from app.observability import init_observability
    init_observability(app)

Each subsystem degrades gracefully if its optional dependency or env var
is missing — they are intentionally side-effect-free at import time so
test runs and `--no-otel` style local boots stay clean.

Forensic audit references:
    - BUG #F.5/F.6/F.7 (no alerting, no tracing, no logs aggregation)
    - BUG #F.9        (no central observability init)
    - BUG #G.2        (failed_login_attempts metric missing)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.observability.metrics import (
    PrometheusMiddleware,
    failed_login_attempts_total,
    celery_queue_length,
    ws_active_connections,
    ws_disconnects_total,
    http_request_duration_seconds,
    http_requests_total,
    primus_backup_last_success_unixtime,
    primus_backup_restore_drill_success,
    register_metrics_endpoint,
)
from app.observability.sentry import init_sentry
from app.observability.tracing import (
    init_tracing,
    get_current_trace_id,
)

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger("primus.observability")

__all__ = [
    "init_observability",
    "PrometheusMiddleware",
    "failed_login_attempts_total",
    "celery_queue_length",
    "ws_active_connections",
    "ws_disconnects_total",
    "http_request_duration_seconds",
    "http_requests_total",
    "primus_backup_last_success_unixtime",
    "primus_backup_restore_drill_success",
    "register_metrics_endpoint",
    "init_sentry",
    "init_tracing",
    "get_current_trace_id",
]


def init_observability(app: "FastAPI") -> dict[str, bool]:
    """Bootstrap the full observability stack on the FastAPI app.

    Order matters:
      1. Sentry FIRST — so any error raised by the other initializers is
         still captured.
      2. Prometheus middleware + /metrics — cheap, always-on.
      3. OpenTelemetry tracing — heaviest dependency tree, last.

    Returns
    -------
    dict[str, bool]
        Per-subsystem init flag, useful for /readyz to advertise.
    """
    status = {"sentry": False, "metrics": False, "tracing": False}

    try:
        status["sentry"] = init_sentry()
    except Exception:
        logger.exception("observability: Sentry init failed (continuing)")

    try:
        app.add_middleware(PrometheusMiddleware)
        register_metrics_endpoint(app)
        status["metrics"] = True
    except Exception:
        logger.exception("observability: Prometheus wiring failed (continuing)")

    try:
        status["tracing"] = init_tracing(app)
    except Exception:
        logger.exception("observability: tracing init failed (continuing)")

    logger.info("observability: init complete %s", status)
    return status
