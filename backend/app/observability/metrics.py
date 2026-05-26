"""
Prometheus metrics for the Primus backend.

Defines the canonical metric vocabulary used by docker/prometheus/rules/
primus_alerts.yml. Every metric here is referenced by at least one
alert rule — keeping them colocated prevents drift between "metric the
app exports" vs "metric the alert queries".

Public metrics
--------------
* http_requests_total{method, endpoint, status, status_class}     Counter
* http_request_duration_seconds{method, endpoint}                 Histogram
* failed_login_attempts_total{reason}                             Counter
* celery_queue_length{queue}                                      Gauge
* ws_active_connections{namespace}                                Gauge
* ws_disconnects_total{namespace, reason}                         Counter
* primus_backup_last_success_unixtime                             Gauge
* primus_backup_restore_drill_success                             Gauge

Forensic audit BUGs:
    - BUG #G.2: failed_login_attempts metric missing -> brute-force alert
                couldn't be written.
    - BUG #D.7: celery_queue_length never published -> ops couldn't tell
                if jobs were piling up.
    - BUG #E.1: ws_disconnects_total missing -> reconnect storms invisible.
    - BUG #H.3: backup health metrics missing -> drill failures unalarmed.
"""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    multiprocess,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger("primus.observability.metrics")


# -----------------------------------------------------------------------------
# Registry — supports both single-process and Gunicorn multi-process modes.
# Multiprocess is opt-in via PROMETHEUS_MULTIPROC_DIR; default falls back to
# the global default registry exposed by prometheus_client.
# -----------------------------------------------------------------------------
import os

_MULTIPROC_DIR = os.getenv("PROMETHEUS_MULTIPROC_DIR")
_REGISTRY: CollectorRegistry | None = None
if _MULTIPROC_DIR:
    _REGISTRY = CollectorRegistry()
    multiprocess.MultiProcessCollector(_REGISTRY)


# -----------------------------------------------------------------------------
# Core HTTP metrics — referenced by HTTP5xxSpike, PaymentWebhook5xx,
# CashfreeWebhookFailureRate alerts.
# -----------------------------------------------------------------------------
http_requests_total = Counter(
    "http_requests_total",
    "HTTP request count by method, endpoint pattern, status code, and class.",
    ["method", "endpoint", "status", "status_class"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds by method + endpoint pattern.",
    ["method", "endpoint"],
    # Buckets sized for an API: sub-50ms is good, >1s is bad.
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)


# -----------------------------------------------------------------------------
# Auth metrics — referenced by AuthBruteForce
# -----------------------------------------------------------------------------
failed_login_attempts_total = Counter(
    "failed_login_attempts_total",
    "Failed login attempts by reason (bad_password, user_not_found, locked, otp_invalid, ...).",
    ["reason"],
)


# -----------------------------------------------------------------------------
# Celery — referenced by CeleryQueueDepth
# -----------------------------------------------------------------------------
celery_queue_length = Gauge(
    "celery_queue_length",
    "Number of tasks waiting in the named Celery queue.",
    ["queue"],
    multiprocess_mode="livesum" if _MULTIPROC_DIR else "all",
)


# -----------------------------------------------------------------------------
# WebSocket — referenced by WebSocketDisconnectsSpike
# -----------------------------------------------------------------------------
ws_active_connections = Gauge(
    "ws_active_connections",
    "Active WebSocket connections by namespace (pc|admin|mobile).",
    ["namespace"],
    multiprocess_mode="livesum" if _MULTIPROC_DIR else "all",
)

ws_disconnects_total = Counter(
    "ws_disconnects_total",
    "WebSocket disconnect events by namespace + reason.",
    ["namespace", "reason"],
)


# -----------------------------------------------------------------------------
# Backups — referenced by BackupOverdue, BackupRestoreDrillFailed
# These are written by the nightly backup cron + the weekly restore drill.
# -----------------------------------------------------------------------------
primus_backup_last_success_unixtime = Gauge(
    "primus_backup_last_success_unixtime",
    "Unix timestamp of the last successful backup. Stale > 4h triggers an alert.",
)

primus_backup_restore_drill_success = Gauge(
    "primus_backup_restore_drill_success",
    "1 if the last restore drill produced a usable database, else 0.",
)


# -----------------------------------------------------------------------------
# Endpoint pattern normalization
# Goal: collapse `/api/user/12345` to `/api/user/{id}` so cardinality stays
# bounded. Falls back to raw path if no rule matches.
# -----------------------------------------------------------------------------
import re

_PATH_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"/api/v1/payment/cashfree/[^/]+"), "/api/v1/payment/cashfree/{id}"),
    (re.compile(r"/api/v1/payment/[^/]+"), "/api/v1/payment/{id}"),
    (re.compile(r"/api/payment/cashfree/[^/]+"), "/api/payment/cashfree/{id}"),
    (re.compile(r"/api/payment/[^/]+"), "/api/payment/{id}"),
    (re.compile(r"/api/user/\d+"), "/api/user/{id}"),
    (re.compile(r"/api/session/\d+"), "/api/session/{id}"),
    (re.compile(r"/api/pc/\d+"), "/api/pc/{id}"),
    (re.compile(r"/api/cafe/\d+"), "/api/cafe/{id}"),
    (re.compile(r"/api/v1/[a-z_]+/\d+"), lambda m: f"{m.group(0).rsplit('/', 1)[0]}/{{id}}"),
]


def _normalize_endpoint(path: str) -> str:
    for pattern, replacement in _PATH_RULES:
        if pattern.match(path):
            if callable(replacement):
                m = pattern.match(path)
                if m is not None:
                    return replacement(m)
            else:
                return replacement
    return path


# -----------------------------------------------------------------------------
# PrometheusMiddleware — observes every request and updates the counters/
# histogram. Skips /metrics + /livez to avoid feedback loops.
# -----------------------------------------------------------------------------
_SKIP_PATHS = frozenset({"/metrics", "/livez", "/readyz", "/health", "/api/health"})


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Record request count + duration into Prometheus."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        path = request.url.path
        if path in _SKIP_PATHS:
            return await call_next(request)

        endpoint = _normalize_endpoint(path)
        method = request.method
        start = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            elapsed = time.perf_counter() - start
            status_class = f"{status_code // 100}xx"
            try:
                http_requests_total.labels(
                    method=method,
                    endpoint=endpoint,
                    status=str(status_code),
                    status_class=status_class,
                ).inc()
                http_request_duration_seconds.labels(
                    method=method, endpoint=endpoint
                ).observe(elapsed)
            except Exception:
                # Metrics MUST never break a request. Swallow.
                logger.debug("metrics: failed to record sample", exc_info=True)


# -----------------------------------------------------------------------------
# /metrics mounting — replaces the inline prometheus_client.make_asgi_app
# block in main.py so the custom registry (multiprocess-aware) is used.
# -----------------------------------------------------------------------------
def register_metrics_endpoint(app: "FastAPI") -> None:
    """Mount /metrics on the FastAPI app.

    MetricsGuardMiddleware (already wired in main.py) gates access by IP
    allowlist + optional bearer token, so this endpoint is only reachable
    from Prometheus / on-cluster scrapers.
    """

    @app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        if _REGISTRY is not None:
            payload = generate_latest(_REGISTRY)
        else:
            payload = generate_latest()
        return Response(content=payload, media_type=CONTENT_TYPE_LATEST)
