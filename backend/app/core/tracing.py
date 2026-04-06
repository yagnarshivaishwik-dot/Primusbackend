"""
OpenTelemetry distributed tracing configuration.

Provides request-level tracing across FastAPI, SQLAlchemy, and Redis.
Trace IDs are propagated into structured JSON logs for correlation.

Enable by setting:
    OTEL_ENABLED=true
    OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317  (or Jaeger/Tempo)

Usage in main.py:
    from app.core.tracing import setup_tracing
    setup_tracing(app)
"""

import logging
import os

from fastapi import FastAPI

logger = logging.getLogger("primus.tracing")

OTEL_ENABLED = os.getenv("OTEL_ENABLED", "false").lower() == "true"
OTEL_SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "primus-backend")
OTEL_EXPORTER_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")


def setup_tracing(app: FastAPI) -> None:
    """
    Initialize OpenTelemetry tracing if enabled.

    Instruments:
    - FastAPI (HTTP spans)
    - SQLAlchemy (DB query spans)
    - Redis (cache operation spans)
    """
    if not OTEL_ENABLED:
        logger.info("OpenTelemetry tracing disabled (set OTEL_ENABLED=true to enable)")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {
                "service.name": OTEL_SERVICE_NAME,
                "service.version": "1.0.0",
                "deployment.environment": os.getenv("ENVIRONMENT", "development"),
            }
        )

        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=OTEL_EXPORTER_ENDPOINT)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)
        logger.info("OpenTelemetry: FastAPI instrumented")

        # Instrument SQLAlchemy
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

            SQLAlchemyInstrumentor().instrument()
            logger.info("OpenTelemetry: SQLAlchemy instrumented")
        except Exception:
            logger.debug("OpenTelemetry: SQLAlchemy instrumentation skipped")

        # Instrument Redis
        try:
            from opentelemetry.instrumentation.redis import RedisInstrumentor

            RedisInstrumentor().instrument()
            logger.info("OpenTelemetry: Redis instrumented")
        except Exception:
            logger.debug("OpenTelemetry: Redis instrumentation skipped")

        logger.info(
            "OpenTelemetry tracing enabled — exporting to %s", OTEL_EXPORTER_ENDPOINT
        )

    except ImportError:
        logger.warning(
            "OpenTelemetry packages not installed. "
            "Install with: pip install opentelemetry-instrumentation-fastapi "
            "opentelemetry-instrumentation-sqlalchemy opentelemetry-instrumentation-redis "
            "opentelemetry-exporter-otlp"
        )
    except Exception:
        logger.exception("Failed to initialize OpenTelemetry tracing")


def get_current_trace_id() -> str | None:
    """Get the current trace ID for log correlation."""
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span and span.get_span_context().trace_id:
            return format(span.get_span_context().trace_id, "032x")
    except Exception:
        pass
    return None
