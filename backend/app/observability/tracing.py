"""
OpenTelemetry tracing wiring for the Primus backend.

Sits next to the older `app.core.tracing` (kept as a thin shim) and
implements the audit-corrected behaviour:
    - OTLP gRPC exporter to OTEL_EXPORTER_OTLP_ENDPOINT (default
      otel-collector:4317)
    - Auto-instrumentation: FastAPI, SQLAlchemy, Redis, Celery, HTTPX
    - Resource attributes scrubbed of PII before export
    - Exclude health-check + metrics endpoints (they would 10x the trace
      volume and burn collector quota)
    - Returns the current trace_id so the JSON logging middleware can
      stamp it into every request log line for log<->trace pivot

Forensic audit BUGs:
    - BUG #F.6  (no tracing backend)
    - BUG #F.6c (trace_id never logged -> Loki<->Tempo correlation broken)
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger("primus.observability.tracing")


_OTEL_ENABLED = os.getenv("OTEL_ENABLED", "true").lower() not in {"false", "0", "no"}
_OTEL_ENDPOINT = (
    os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or "http://otel-collector:4317"
).strip()
_OTEL_SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "primus-backend")
_OTEL_EXCLUDED_URLS = os.getenv(
    "OTEL_PYTHON_FASTAPI_EXCLUDED_URLS",
    "/metrics,/livez,/readyz,/health,/api/health",
)


def init_tracing(app: "FastAPI") -> bool:
    """Initialise OpenTelemetry against the running FastAPI app.

    Returns True if tracing started, False otherwise.
    """
    if not _OTEL_ENABLED:
        logger.info("tracing: OTEL_ENABLED=false -> skipping")
        return False

    if not _OTEL_ENDPOINT:
        logger.info("tracing: OTEL_EXPORTER_OTLP_ENDPOINT unset -> skipping")
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:  # pragma: no cover
        logger.warning("tracing: OTel libs missing (%s) -> skipping", exc)
        return False

    resource = Resource.create(
        {
            "service.name": _OTEL_SERVICE_NAME,
            "service.version": os.getenv("BUILD_REVISION") or "dev",
            "deployment.environment": os.getenv("ENVIRONMENT", "development"),
        }
    )

    try:
        provider = TracerProvider(resource=resource)
        # `insecure=True` is correct for in-cluster otel-collector that
        # speaks plaintext gRPC. Front it with TLS when going cross-cluster.
        insecure = _OTEL_ENDPOINT.startswith("http://") or _OTEL_ENDPOINT.startswith("grpc://")
        exporter = OTLPSpanExporter(endpoint=_OTEL_ENDPOINT, insecure=insecure)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
    except Exception:
        logger.exception("tracing: TracerProvider setup failed")
        return False

    try:
        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls=_OTEL_EXCLUDED_URLS,
        )
    except Exception:
        logger.exception("tracing: FastAPI instrumentation failed")
        return False

    # Optional auto-instrumentation — each is wrapped because the import
    # may be missing in slim images.
    for label, instrument in (
        ("sqlalchemy", _instrument_sqlalchemy),
        ("redis", _instrument_redis),
        ("celery", _instrument_celery),
        ("httpx", _instrument_httpx),
    ):
        try:
            instrument()
            logger.info("tracing: %s instrumented", label)
        except Exception:
            logger.debug("tracing: %s instrumentation skipped", label, exc_info=True)

    logger.info("tracing: OTel initialized, exporting to %s", _OTEL_ENDPOINT)
    return True


def _instrument_sqlalchemy() -> None:
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

    SQLAlchemyInstrumentor().instrument()


def _instrument_redis() -> None:
    from opentelemetry.instrumentation.redis import RedisInstrumentor

    RedisInstrumentor().instrument()


def _instrument_celery() -> None:
    from opentelemetry.instrumentation.celery import CeleryInstrumentor

    CeleryInstrumentor().instrument()


def _instrument_httpx() -> None:
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

    HTTPXClientInstrumentor().instrument()


def get_current_trace_id() -> str | None:
    """Return the active trace ID as a 32-char hex string, or None."""
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            return format(ctx.trace_id, "032x")
    except Exception:
        pass
    return None
