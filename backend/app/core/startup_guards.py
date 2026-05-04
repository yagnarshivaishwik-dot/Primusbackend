"""Phase 0 startup guards: fail closed if the process would boot insecurely.

Audit finding: app/config.py allows weak development defaults for JWT_SECRET,
SECRET_KEY, and APP_SECRET when ENVIRONMENT is not 'production'. A misconfigured
production deploy that did NOT set ENVIRONMENT=production silently picks up the
deterministic dev string.

This module runs at startup (called from main.py lifespan) and refuses to boot
when:
  - We are running in production AND any required secret matches the dev pattern
  - We are running in production AND CSRF protection is disabled
  - JWT signing algorithm is set to 'none' (alg-confusion attack vector)
  - DATABASE_URL points at sqlite (production must be PostgreSQL)
  - APP_BASE_URL uses plain http:// in production
  - Cashfree / Razorpay / Stripe keys still match the example placeholders

The whole point is to take a defense-in-depth check that today depends on
human discipline (read the env example, set every variable, restart) and
make it a hard failure that shows up immediately at deploy time.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass


# These match the dev-default pattern produced by config._require_env_var when
# allow_dev_default=True and the env var is unset.
_DEV_DEFAULT_PREFIXES = ("dev-jwt-secret", "dev-secret-key", "dev-app-secret")

# Known placeholder values from env.example / env.production.example. These
# must never appear in a real production process.
_KNOWN_PLACEHOLDERS = {
    "your-super-secret-jwt-key-change-this-in-production",
    "your-super-secret-key-change-this-in-production",
    "change-me",
    "changeme",
    "ChangeMe123!",
    "your-app-secret",
    "your_jwt_secret_here",
    "your_secret_key_here",
    "secret",
    "supersecret",
    "password",
    "primus_dev",
    "root",
}


@dataclass
class GuardFailure:
    var: str
    reason: str

    def render(self) -> str:
        return f"  - {self.var}: {self.reason}"


def _is_placeholder(value: str) -> bool:
    if not value:
        return True
    if any(value.startswith(p) for p in _DEV_DEFAULT_PREFIXES):
        return True
    if value in _KNOWN_PLACEHOLDERS:
        return True
    if len(value) < 32:
        return True
    return False


def collect_failures(*, is_production: bool) -> list[GuardFailure]:
    """Run every check; return all failures (so the operator sees the full list)."""
    failures: list[GuardFailure] = []

    if not is_production:
        # Soft checks for dev: still warn via stderr in main.py, but do not abort.
        return failures

    # 1. Required signing secrets must be strong and non-placeholder.
    for var in ("JWT_SECRET", "SECRET_KEY", "APP_SECRET"):
        value = os.getenv(var, "")
        if _is_placeholder(value):
            failures.append(
                GuardFailure(
                    var=var,
                    reason="value is empty, a known placeholder, or a dev default; "
                    "generate with `python -c \"import secrets; print(secrets.token_urlsafe(64))\"` "
                    "and set in your secrets store",
                )
            )

    # 2. JWT algorithm must not be 'none' or 'None'.
    alg = (os.getenv("JWT_ALGORITHM") or "HS256").strip()
    if alg.lower() == "none":
        failures.append(
            GuardFailure(
                var="JWT_ALGORITHM",
                reason="'none' algorithm enables JWT alg-confusion attacks; use HS256 or RS256",
            )
        )

    # 3. CSRF protection must be ON in production.
    csrf_flag = os.getenv("ENABLE_CSRF_PROTECTION", "true").strip().lower()
    if csrf_flag in ("0", "false", "no", "off"):
        failures.append(
            GuardFailure(
                var="ENABLE_CSRF_PROTECTION",
                reason="CSRF protection cannot be disabled in production",
            )
        )

    # 4. ALLOW_ALL_CORS must not be true.
    if os.getenv("ALLOW_ALL_CORS", "").strip().lower() in ("1", "true", "yes", "on"):
        failures.append(
            GuardFailure(
                var="ALLOW_ALL_CORS",
                reason="wildcard CORS is forbidden in production",
            )
        )

    # 5. Debug endpoints flag.
    if (
        os.getenv("ENABLE_SECURITY_DEBUG_ENDPOINTS", "").strip().lower()
        in ("1", "true", "yes", "on")
    ):
        failures.append(
            GuardFailure(
                var="ENABLE_SECURITY_DEBUG_ENDPOINTS",
                reason="debug endpoints reveal internals; disable in production",
            )
        )

    # 6. DATABASE_URL must not be sqlite in production.
    db_url = os.getenv("DATABASE_URL", "")
    if db_url.lower().startswith("sqlite"):
        failures.append(
            GuardFailure(
                var="DATABASE_URL",
                reason="sqlite is not a production database; use PostgreSQL",
            )
        )

    # 7. APP_BASE_URL must be https in production.
    base_url = os.getenv("APP_BASE_URL", "")
    if base_url and base_url.startswith("http://"):
        failures.append(
            GuardFailure(
                var="APP_BASE_URL",
                reason=f"plain http:// is not allowed in production (got {base_url!r})",
            )
        )

    # 8. Payment provider keys: if set, they must not be placeholders. If empty,
    #    that is the operator's choice (provider not enabled).
    for var in (
        "CASHFREE_APP_ID",
        "CASHFREE_SECRET_KEY",
        "CASHFREE_WEBHOOK_SECRET",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "STRIPE_SECRET",
    ):
        value = os.getenv(var, "")
        if value and value.lower() in {p.lower() for p in _KNOWN_PLACEHOLDERS}:
            failures.append(
                GuardFailure(
                    var=var,
                    reason="value is a placeholder; rotate via provider dashboard",
                )
            )

    return failures


def assert_safe_startup(*, is_production: bool) -> None:
    """Raise (or sys.exit) if any guard fails. Call from FastAPI lifespan."""
    failures = collect_failures(is_production=is_production)
    if not failures:
        return

    msg = (
        "FATAL: Primus startup guards rejected this configuration.\n"
        "Refusing to boot because the following environment values are unsafe "
        "for a production deploy:\n"
        + "\n".join(f.render() for f in failures)
        + "\n\nFix the values in your secrets store and redeploy. See "
        "scripts/security/SECRET_ROTATION_RUNBOOK.md for guidance."
    )
    print(msg, file=sys.stderr)
    sys.exit(1)
