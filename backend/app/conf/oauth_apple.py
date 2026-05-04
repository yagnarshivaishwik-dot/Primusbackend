"""
Apple Sign-In OAuth configuration and ID token verification.

Environment variables (all read at call time so tests can patch freely):
    APPLE_OAUTH_CLIENT_ID     - Apple Services ID (e.g. com.primustech.primus.service)
                                Used for web / server-side OAuth flows.
    APPLE_OAUTH_TEAM_ID       - 10-char Apple Developer Team ID.
    APPLE_OAUTH_KEY_ID        - 10-char Apple Auth Key ID associated with the
                                private key used to sign Apple client secrets.
    APPLE_OAUTH_PRIVATE_KEY   - Apple private key in PEM format. Value may be
                                either the literal PEM contents (with newlines)
                                or a filesystem path to the .p8 / .pem file.
    APPLE_OAUTH_ISSUER        - Expected `iss` claim on the ID token. Defaults
                                to "https://appleid.apple.com".
    APPLE_OAUTH_BUNDLE_IDS    - Comma-separated list of bundle IDs (iOS apps)
                                OR Services IDs allowed as the `aud` claim on
                                an Apple ID token. Example:
                                "com.primustech.primus,com.primustech.primus.dev".
                                At least one must match the token `aud`.

Apple JWKS (`https://appleid.apple.com/auth/keys`) is fetched lazily and
cached in-process for APPLE_JWKS_TTL_SECONDS (default: 24h). On signature
verification failure we force-refresh the JWKS once in case Apple has
rotated keys.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient
from jwt.algorithms import RSAAlgorithm
from jwt.exceptions import PyJWTError


APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_DEFAULT_ISSUER = "https://appleid.apple.com"
APPLE_JWKS_TTL_SECONDS = int(os.getenv("APPLE_JWKS_TTL_SECONDS", str(24 * 60 * 60)))


class AppleAuthError(Exception):
    """Raised when an Apple ID token fails validation.

    Callers should translate this into an HTTP 401 response.
    """

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


@dataclass
class AppleOAuthConfig:
    """Resolved Apple OAuth configuration (read from env)."""

    client_id: str | None
    team_id: str | None
    key_id: str | None
    private_key: str | None
    issuer: str
    bundle_ids: tuple[str, ...]


def _load_private_key(value: str | None) -> str | None:
    """Return the PEM contents whether `value` is a path or the PEM itself."""
    if not value:
        return None
    v = value.strip()
    # Detect a path (does not contain BEGIN header) that exists on disk
    if "BEGIN" not in v and os.path.isfile(v):
        try:
            with open(v, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return None
    return value


def get_apple_config() -> AppleOAuthConfig:
    """Read Apple OAuth configuration from environment variables."""
    bundle_ids_raw = os.getenv("APPLE_OAUTH_BUNDLE_IDS", "") or ""
    bundle_ids = tuple(
        b.strip() for b in bundle_ids_raw.split(",") if b.strip()
    )
    return AppleOAuthConfig(
        client_id=os.getenv("APPLE_OAUTH_CLIENT_ID"),
        team_id=os.getenv("APPLE_OAUTH_TEAM_ID"),
        key_id=os.getenv("APPLE_OAUTH_KEY_ID"),
        private_key=_load_private_key(os.getenv("APPLE_OAUTH_PRIVATE_KEY")),
        issuer=os.getenv("APPLE_OAUTH_ISSUER", APPLE_DEFAULT_ISSUER),
        bundle_ids=bundle_ids,
    )


# --- JWKS cache ---------------------------------------------------------------

_JwksCacheEntry = tuple[float, dict[str, Any]]
_jwks_cache: _JwksCacheEntry | None = None


async def _fetch_apple_jwks(force: bool = False) -> dict[str, Any]:
    """Fetch Apple's JWKS document, using a short-TTL in-memory cache."""
    global _jwks_cache
    now = time.time()
    if not force and _jwks_cache is not None:
        cached_at, doc = _jwks_cache
        if now - cached_at < APPLE_JWKS_TTL_SECONDS:
            return doc

    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(APPLE_JWKS_URL)
        resp.raise_for_status()
        doc = resp.json()

    _jwks_cache = (now, doc)
    return doc


def _get_signing_key(jwks: dict[str, Any], kid: str) -> Any:
    """Pick the matching JWK for `kid` and return a verification key."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return RSAAlgorithm.from_jwk(key)
    return None


async def verify_apple_id_token(
    id_token: str,
    expected_nonce: str | None = None,
) -> dict[str, Any]:
    """Validate an Apple Sign-In `id_token` and return its claims.

    Steps performed:
        1. Read the unverified JWT header to find `kid` + `alg`.
        2. Fetch (or reuse) Apple's JWKS; look up the matching signing key.
           Retry once with a forced refresh if the `kid` is unknown, in case
           Apple has rotated keys.
        3. Verify signature, `iss`, `aud` (one of the configured bundle IDs),
           and `exp`.
        4. If `expected_nonce` is provided, verify the token `nonce` claim
           matches. (Apple returns the client-provided nonce verbatim, not
           the sha256 of it, when the client passes the raw nonce to its
           sign-in request. If your mobile client hashes the nonce before
           sending, the stored `expected_nonce` must be the same hashed
           value.)

    Raises:
        AppleAuthError: any verification step failed. Caller maps to 401.
    """
    cfg = get_apple_config()
    if not cfg.bundle_ids:
        raise AppleAuthError("Apple Sign-In is not configured (no bundle IDs).")

    try:
        header = jwt.get_unverified_header(id_token)
    except PyJWTError as exc:
        raise AppleAuthError("Malformed Apple ID token header") from exc

    kid = header.get("kid")
    alg = header.get("alg", "RS256")
    if not kid:
        raise AppleAuthError("Apple ID token is missing kid")

    jwks = await _fetch_apple_jwks()
    signing_key = _get_signing_key(jwks, kid)
    if signing_key is None:
        # Rotation: force refresh and try again once.
        jwks = await _fetch_apple_jwks(force=True)
        signing_key = _get_signing_key(jwks, kid)
    if signing_key is None:
        raise AppleAuthError("No matching Apple signing key for kid")

    try:
        claims = jwt.decode(
            id_token,
            signing_key,
            algorithms=[alg],
            audience=list(cfg.bundle_ids),
            issuer=cfg.issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppleAuthError("Apple ID token has expired") from exc
    except jwt.InvalidAudienceError as exc:
        raise AppleAuthError("Apple ID token audience not allowed") from exc
    except jwt.InvalidIssuerError as exc:
        raise AppleAuthError("Apple ID token issuer is invalid") from exc
    except jwt.InvalidSignatureError as exc:
        raise AppleAuthError("Apple ID token signature is invalid") from exc
    except PyJWTError as exc:
        raise AppleAuthError(f"Apple ID token is invalid: {exc}") from exc

    if expected_nonce is not None:
        token_nonce = claims.get("nonce")
        if not token_nonce or token_nonce != expected_nonce:
            raise AppleAuthError("Apple ID token nonce mismatch")

    return claims


__all__ = [
    "AppleAuthError",
    "AppleOAuthConfig",
    "APPLE_DEFAULT_ISSUER",
    "APPLE_JWKS_URL",
    "get_apple_config",
    "verify_apple_id_token",
]
