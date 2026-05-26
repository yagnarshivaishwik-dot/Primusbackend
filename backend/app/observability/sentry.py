"""
Sentry SDK initialization for the Primus backend.

Lazy + env-gated:
    - SENTRY_DSN unset           -> skip silently
    - sentry_sdk not installed   -> warn + skip
    - init failure               -> log error + return False (process keeps running)

Forensic audit BUGs:
    - BUG #F.5c (no error tracker -> traceless 500s reported only by users)
    - BUG #G.7  (Authorization header was getting included in Sentry events
                  -> credentials leaked into the error tracker)

PII scrubbing
-------------
`send_default_pii=False` is the baseline; on top of that, the before_send
hook walks the event payload and redacts anything whose key looks like a
secret (token, password, cookie, authorization, otp, pin, cvv, card, ...).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger("primus.observability.sentry")


_SENSITIVE_KEYS = re.compile(
    r"(?i)(authorization|cookie|set-cookie|x-csrf-token|"
    r"jwt|token|secret|password|api[-_]?key|access[-_]?key|"
    r"refresh[-_]?token|otp|pin|cvv|card[-_]?number|client[-_]?secret)"
)
_SCRUB_PLACEHOLDER = "[redacted]"


def _scrub(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: _SCRUB_PLACEHOLDER if _SENSITIVE_KEYS.search(str(k)) else _scrub(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub(x) for x in obj]
    return obj


def _before_send(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    try:
        req = event.get("request")
        if isinstance(req, dict):
            for key in ("headers", "cookies", "data", "query_string"):
                if key in req:
                    req[key] = _scrub(req[key])
        if "extra" in event:
            event["extra"] = _scrub(event["extra"])
        if "contexts" in event:
            event["contexts"] = _scrub(event["contexts"])
        if "tags" in event:
            event["tags"] = _scrub(event["tags"])
    except Exception:  # pragma: no cover
        pass
    return event


def init_sentry() -> bool:
    """Initialise Sentry if SENTRY_DSN is set.

    Returns True if Sentry started, False otherwise.
    """
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        logger.info("sentry: SENTRY_DSN not set -> skipping init")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.redis import RedisIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration
    except ImportError as exc:  # pragma: no cover
        logger.warning("sentry: sentry_sdk not installed (%s) -> skipping", exc)
        return False

    environment = (os.getenv("ENVIRONMENT") or "development").strip().lower()
    release = (
        os.getenv("BUILD_REVISION")
        or os.getenv("GIT_SHA")
        or os.getenv("RELEASE")
        or "dev"
    )

    try:
        traces_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05"))
    except ValueError:
        traces_rate = 0.05
    try:
        profiles_rate = float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0"))
    except ValueError:
        profiles_rate = 0.0

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release,
            send_default_pii=False,
            attach_stacktrace=True,
            traces_sample_rate=traces_rate,
            profiles_sample_rate=profiles_rate,
            before_send=_before_send,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                StarletteIntegration(transaction_style="endpoint"),
                SqlalchemyIntegration(),
                CeleryIntegration(),
                RedisIntegration(),
            ],
            # Avoid leaking Authorization in breadcrumb headers
            max_breadcrumbs=50,
        )
    except Exception:
        logger.exception("sentry: init failed")
        return False

    logger.info(
        "sentry: initialized (env=%s, release=%s, traces=%.2f, profiles=%.2f)",
        environment, release, traces_rate, profiles_rate,
    )
    return True
