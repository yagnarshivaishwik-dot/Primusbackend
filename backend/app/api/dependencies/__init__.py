"""FastAPI dependency factories shared across endpoints.

Phase 1 introduces:
  - rate_limit.RateLimit  — per-endpoint Redis-backed sliding-window limiter

Other modules will land here as Phase 1+ progresses.
"""

from app.api.dependencies.rate_limit import RateLimit  # noqa: F401
