"""Phase 1: clean Argon2id password handling with rolling legacy migration.

Audit findings addressed:
  - BE-H2 / SEC-H2: SHA-256 pre-hash before Argon2 caps entropy at 65 hex chars
    and enables rainbow-table precomputation against the SHA layer. Removed.

Behaviour:
  - hash_password(plain) -> str
        Always produces an Argon2id hash. No pre-hashing.

  - verify_password(plain, stored, *, on_legacy_match=None) -> VerifyResult
        Returns a structured result with `ok` and `needs_rehash`. Supports four
        stored-hash formats so we can migrate live users without invalidating
        anyone's password:

          (1) Argon2id direct      (the new format we always produce)
          (2) Argon2id of a SHA-256 digest of the password
              (the LEGACY dual-hash format created by the deprecated
              app.api.endpoints.auth._normalize_password)
          (3) bcrypt (legacy passlib)
          (4) Plaintext SHA-256 hex digest (very-old legacy)

        On a successful verify against a legacy format, `needs_rehash=True` is
        returned so the caller can rewrite `user.password_hash` with a fresh
        Argon2id hash on the same login. This is a rolling migration: every
        user gets upgraded the next time they log in successfully, without
        any forced password reset.

The Argon2 parameters here are the audit-recommended defaults
(time_cost=3, memory_cost=64 MiB, parallelism=2). They can be tuned via env
vars without breaking existing hashes — Argon2 stores its parameters inside
the hash, and `check_needs_rehash()` will trigger a re-hash on next login if
the parameters change.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from passlib.hash import bcrypt as _passlib_bcrypt


logger = logging.getLogger("primus.passwords")


# Argon2id parameters. Read from env so ops can raise memory_cost on bigger
# servers without a code change. Values below are the audit-recommended floor.
_ARGON2_TIME_COST = int(os.getenv("ARGON2_TIME_COST", "3"))
_ARGON2_MEMORY_COST = int(os.getenv("ARGON2_MEMORY_COST_KIB", "65536"))  # 64 MiB
_ARGON2_PARALLELISM = int(os.getenv("ARGON2_PARALLELISM", "2"))

_hasher = PasswordHasher(
    time_cost=_ARGON2_TIME_COST,
    memory_cost=_ARGON2_MEMORY_COST,
    parallelism=_ARGON2_PARALLELISM,
)


# Maximum plaintext length we accept. Argon2id has no real limit, but accepting
# a 10 MB password from the network would let an attacker pin a CPU per
# request. Keep this generous-but-bounded.
_MAX_PASSWORD_LEN = 1024


@dataclass(frozen=True)
class VerifyResult:
    """Result of verify_password()."""

    ok: bool
    needs_rehash: bool
    legacy_format: str | None  # "argon2_sha256", "bcrypt", "sha256_plain", or None

    def __bool__(self) -> bool:
        return self.ok


# --- helpers ---------------------------------------------------------------

def _is_argon2(hash_str: str) -> bool:
    return hash_str.startswith("$argon2")


def _is_bcrypt(hash_str: str) -> bool:
    # passlib bcrypt uses $2a$, $2b$, or $2y$ prefixes.
    return hash_str.startswith(("$2a$", "$2b$", "$2y$"))


def _is_sha256_hex(hash_str: str) -> bool:
    # 64 hex chars, no $-prefix. The very-old plaintext-sha256 format.
    return (
        len(hash_str) == 64
        and not hash_str.startswith("$")
        and all(c in "0123456789abcdefABCDEF" for c in hash_str)
    )


def _validate_input(plain: str) -> None:
    if plain is None:
        raise ValueError("password must not be None")
    if not isinstance(plain, str):
        raise TypeError("password must be a string")
    if len(plain) == 0:
        raise ValueError("password must not be empty")
    if len(plain) > _MAX_PASSWORD_LEN:
        raise ValueError(f"password must be <= {_MAX_PASSWORD_LEN} characters")


def _legacy_sha256_normalized(plain: str) -> str:
    """Reproduce the deprecated _normalize_password() output for back-compat verify."""
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


# --- public API ------------------------------------------------------------

def hash_password(plain: str) -> str:
    """Hash a plaintext password with Argon2id. No pre-hashing."""
    _validate_input(plain)
    return _hasher.hash(plain)


def verify_password(plain: str, stored: str | None) -> VerifyResult:
    """Verify a plaintext against any supported stored format.

    Returns ok=False on any unknown / empty stored value. Never raises on a
    bad password — only on programming errors (None, wrong type, oversized
    input).
    """
    _validate_input(plain)
    if not stored:
        return VerifyResult(ok=False, needs_rehash=False, legacy_format=None)

    # Format 1: modern Argon2id direct
    if _is_argon2(stored):
        # Try the modern path first.
        try:
            _hasher.verify(stored, plain)
            needs = _hasher.check_needs_rehash(stored)
            return VerifyResult(ok=True, needs_rehash=needs, legacy_format=None)
        except argon2_exceptions.VerifyMismatchError:
            pass
        except argon2_exceptions.VerificationError:
            pass

        # Fallback: the LEGACY dual-hash (Argon2id of SHA-256 of the password).
        # If this matches, the row needs to be re-hashed with the modern format.
        try:
            normalized = _legacy_sha256_normalized(plain)
            _hasher.verify(stored, normalized)
            return VerifyResult(ok=True, needs_rehash=True, legacy_format="argon2_sha256")
        except argon2_exceptions.VerifyMismatchError:
            return VerifyResult(ok=False, needs_rehash=False, legacy_format=None)
        except argon2_exceptions.VerificationError:
            return VerifyResult(ok=False, needs_rehash=False, legacy_format=None)

    # Format 3: bcrypt (very old).
    if _is_bcrypt(stored):
        try:
            ok = _passlib_bcrypt.verify(plain, stored)
        except Exception:  # passlib raises a variety of internal types
            ok = False
        return VerifyResult(ok=ok, needs_rehash=ok, legacy_format="bcrypt" if ok else None)

    # Format 4: bare SHA-256 hex digest (oldest known format).
    if _is_sha256_hex(stored):
        digest = _legacy_sha256_normalized(plain)
        ok = hmac.compare_digest(digest.lower(), stored.lower())
        return VerifyResult(ok=ok, needs_rehash=ok, legacy_format="sha256_plain" if ok else None)

    # Unknown format: fail closed.
    logger.warning("verify_password: unknown stored hash format prefix=%r", stored[:6])
    return VerifyResult(ok=False, needs_rehash=False, legacy_format=None)


def authenticate_and_maybe_rehash(
    plain: str,
    stored: str | None,
    *,
    on_rehash,
) -> bool:
    """Helper for endpoint code: verify, and if the user is on a legacy hash
    format, call `on_rehash(new_hash)` so the caller can update the DB row in
    the same transaction.

    `on_rehash` is invoked with the freshly-computed Argon2id hash string. If
    the verify fails, `on_rehash` is not called.

    Returns True iff the password matched.
    """
    result = verify_password(plain, stored)
    if not result.ok:
        return False

    if result.needs_rehash:
        new_hash = hash_password(plain)
        try:
            on_rehash(new_hash)
        except Exception:
            # Don't let a rehash failure surface as an auth failure. Log loudly.
            logger.exception(
                "verify_password: rehash callback raised; password verified ok "
                "but hash was not upgraded (legacy_format=%s)",
                result.legacy_format,
            )

    return True
