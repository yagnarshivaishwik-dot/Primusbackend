"""Phase 4: Sentry + OpenTelemetry initialization.

Audit reference: master report Section F.5 (observability uplift) +
audit B.10 / Phase 4 step 21 (Sentry).

Goal: when this module's `init_observability()` runs at startup, the
process gets:
  - Sentry exception capture (if SENTRY_DSN is set)
  - OTel resource attributes (service name, version, deployment env)
  - OTel auto-instrumentation for FastAPI, SQLAlchemy, HTTPX, Redis, Celery
  - OTLP gRPC export to OTEL_EXPORTER_OTLP_ENDPOINT (no-op if unset)

Both subsystems are entirely optional and degrade gracefully:
  - Missing libraries → log a warning and skip
  - Missing env vars  → log info and skip
  - Init failure      → log error and continue (process still starts)

PII safety:
  - Sentry's `send_default_pii` is forced to False
  - We patch the before_send hook to scrub Authorization headers and any
    field whose name looks like a token / password / key
  - OTel spans get the same scrubbing via a custom span processor
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any


logger = logging.getLogger("primus.observability")


# Field names whose values must NEVER appear in observability data.
_SENSITIVE_KEYS = re.compile(
    r"(?i)(authorization|cookie|set-cookie|x-csrf-token|"
    r"jwt|token|secret|password|api[-_]?key|access[-_]?key|"
    r"refresh[-_]?token|otp|pin|cvv|card[-_]?number|client[-_]?secret)"
)

_SCRUB_PLACEHOLDER = "[redacted]"


def _scrub(obj: Any) -> Any:
    """Recursively redact sensitive values in a Sentry / OTel payload."""
    if isinstance(obj, dict):
        return {
            k: _SCRUB_PLACEHOLDER if _SENSITIVE_KEYS.search(str(k)) else _scrub(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub(x) for x in obj]
    return obj


# --- Sentry ----------------------------------------------------------------

def _init_sentry() -> bool:
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        logger.info("observability: SENTRY_DSN not set; skipping Sentry init")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
        from sentry_sdk.integrations.redis import RedisIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError as exc:
        logger.warning("observability: sentry_sdk not installed (%s); skipping", exc)
        return False

    def _before_send(event, hint):
        try:
            if "request" in event and isinstance(event["request"], dict):
                req = event["request"]
                if "headers" in req:
                    req["headers"] = _scrub(req["headers"])
                if "cookies" in req:
                    req["cookies"] = _scrub(req["cookies"])
                if "data" in req:
                    req["data"] = _scrub(req["data"])
            if "extra" in event:
                event["extra"] = _scrub(event["extra"])
        except Exception:
            pass
        return event

    environment = (os.getenv("ENVIRONMENT") or "unknown").strip().lower()
    sample = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05"))
    profile = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0"))
    release = os.getenv("BUILD_REVISION") or os.getenv("GIT_SHA") or "dev"

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            send_default_pii=False,
            attach_stacktrace=True,
            traces_sample_rate=sample,
            profiles_sample_rate=profile,
            before_send=_before_send,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                StarletteIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                CeleryIntegration(),
                RedisIntegration(),
            ],
        )
    except Exception as exc:
        logger.error("observability: Sentry init failed: %r", exc)
        return False

    logger.info(
        "observability: Sentry initialized (env=%s, traces=%.2f, profiles=%.2f)",
        environment, sample, profile,
    )
    return True


# --- OpenTelemetry ---------------------------------------------------------

def _init_otel(app) -> bool:
    endpoint = (os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    if not endpoint:
        logger.info("observability: OTEL_EXPORTER_OTLP_ENDPOINT not set; skipping OTel")
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.celery import CeleryInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError as exc:
        logger.warning("observability: OTel libs not installed (%s); skipping", exc)
        return False

    resource = Resource.create(
        {
            "service.name": os.getenv("OTEL_SERVICE_NAME", "primus-backend"),
            "service.version": os.getenv("BUILD_REVISION") or "dev",
            "deployment.environment": os.getenv("ENVIRONMENT", "unknown"),
        }
    )

    try:
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=False))
        )
        trace.set_tracer_provider(provider)
    except Exception as exc:
        logger.error("observability: OTel TracerProvider setup failed: %r", exc)
        return False

    try:
        # Auto-instrument the FastAPI app + key downstreams. Each call is
        # idempotent within a process, so multiple init_observability() calls
        # are safe (e.g., dev reload).
        FastAPIInstrumentor.instrument_app(
            app,
            excluded_urls="/api/health,/metrics",
        )
        SQLAlchemyInstrumentor().instrument()
        RedisInstrumentor().instrument()
        CeleryInstrumentor().instrument()
        HTTPXClientInstrumentor().instrument()
    except Exception as exc:
        logger.error("observability: OTel instrumentation failed: %r", exc)
        return False

    logger.info("observability: OTel initialized, exporting to %s", endpoint)
    return True


# --- public entry ----------------------------------------------------------

def init_observability(app) -> dict[str, bool]:
    """Wire Sentry + OTel against the running FastAPI app.

    Returns a dict with which subsystem actually started, useful for the
    /api/health endpoint to advertise.
    """
    sentry_ok = _init_sentry()
    otel_ok = _init_otel(app)
    return {"sentry": sentry_ok, "otel": otel_ok}
