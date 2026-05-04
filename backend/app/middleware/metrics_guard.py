"""Phase 0: gate /metrics behind an IP allowlist or shared-token check.

Defense-in-depth. Nginx already restricts /metrics to internal CIDRs in
nginx/default.conf, but if nginx is bypassed (direct backend access during a
debugging session, future ingress change, or a compose-file misedit), this
middleware is the second line.

The middleware allows the request when ANY of these hold:
  1. METRICS_ALLOWED_CIDRS includes the client's address (default: 127.0.0.0/8,
     10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  2. The request carries `Authorization: Bearer <METRICS_TOKEN>`
  3. The request carries `X-Metrics-Token: <METRICS_TOKEN>`

Otherwise the response is 404 — the same status nginx would return externally,
so the existence of /metrics is not advertised.

Configuration:
  METRICS_TOKEN          Optional shared bearer token. If unset, only IP
                         allowlist is checked. Generate with
                         `python -c "import secrets; print(secrets.token_urlsafe(48))"`
                         and load via Vault.
  METRICS_ALLOWED_CIDRS  Comma-separated list of CIDRs. Defaults shown above.
  METRICS_TRUSTED_PROXIES  CIDRs of front-of-app load balancers (Cloudflare,
                         nginx) whose X-Forwarded-For we will trust. Defaults
                         to the same internal ranges as ALLOWED_CIDRS.
"""

from __future__ import annotations

import ipaddress
import logging
import os
from typing import Iterable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


_LOGGER = logging.getLogger("primus.middleware.metrics_guard")

_DEFAULT_INTERNAL_CIDRS = (
    "127.0.0.0/8",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "::1/128",
    "fc00::/7",
)

_PROTECTED_PATHS = ("/metrics",)


def _parse_cidrs(env_value: str | None, default: Iterable[str]) -> list[ipaddress._BaseNetwork]:
    raw = (env_value or ",".join(default)).strip()
    nets: list[ipaddress._BaseNetwork] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            nets.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            _LOGGER.warning("metrics_guard: ignoring invalid CIDR %r", token)
    return nets


class MetricsGuardMiddleware(BaseHTTPMiddleware):
    """Hide /metrics from anyone who isn't internal or token-bearing."""

    def __init__(self, app, *, protected_paths: Iterable[str] = _PROTECTED_PATHS):
        super().__init__(app)
        self._protected = tuple(protected_paths)
        self._allowed = _parse_cidrs(
            os.getenv("METRICS_ALLOWED_CIDRS"), _DEFAULT_INTERNAL_CIDRS
        )
        self._trusted_proxies = _parse_cidrs(
            os.getenv("METRICS_TRUSTED_PROXIES"), _DEFAULT_INTERNAL_CIDRS
        )
        token = os.getenv("METRICS_TOKEN", "").strip()
        # Reject obviously-weak tokens; treat as unset.
        self._token = token if len(token) >= 32 else ""
        if not self._token:
            _LOGGER.info(
                "metrics_guard: no METRICS_TOKEN configured (or too short); "
                "/metrics is restricted to allowed CIDRs only"
            )

    def _resolve_client_ip(self, request: Request) -> str | None:
        # When the request hit a trusted proxy, prefer the leftmost
        # X-Forwarded-For entry. Otherwise use the direct peer.
        peer = request.client.host if request.client else None
        if not peer:
            return None
        try:
            peer_addr = ipaddress.ip_address(peer)
        except ValueError:
            return None

        if any(peer_addr in net for net in self._trusted_proxies):
            xff = request.headers.get("x-forwarded-for", "")
            if xff:
                first = xff.split(",")[0].strip()
                try:
                    ipaddress.ip_address(first)
                    return first
                except ValueError:
                    pass
        return str(peer_addr)

    def _is_allowed_ip(self, ip: str | None) -> bool:
        if not ip:
            return False
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return any(addr in net for net in self._allowed)

    def _has_valid_token(self, request: Request) -> bool:
        if not self._token:
            return False
        bearer = request.headers.get("authorization", "")
        if bearer.lower().startswith("bearer "):
            if _constant_time_eq(bearer[7:].strip(), self._token):
                return True
        x_token = request.headers.get("x-metrics-token", "").strip()
        if x_token and _constant_time_eq(x_token, self._token):
            return True
        return False

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not any(path == p or path.startswith(p + "/") for p in self._protected):
            return await call_next(request)

        client_ip = self._resolve_client_ip(request)

        if self._is_allowed_ip(client_ip) or self._has_valid_token(request):
            return await call_next(request)

        # Hide existence: 404 rather than 401/403 so scanners can't tell
        # we have a metrics endpoint at all.
        _LOGGER.warning(
            "metrics_guard: rejected %s from %s (no token, not in allowlist)",
            path,
            client_ip,
        )
        return Response(status_code=404)


def _constant_time_eq(a: str, b: str) -> bool:
    """secrets.compare_digest wrapper that tolerates None / different lengths."""
    if a is None or b is None:
        return False
    import hmac

    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
