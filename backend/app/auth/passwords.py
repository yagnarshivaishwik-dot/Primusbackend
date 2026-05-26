"""Auth-package convenience surface for password helpers.

The real implementation lives in :mod:`app.utils.passwords` (Phase 1 password
handling — Argon2id with rolling legacy migration; audit BE-H2/SEC-H2).

This module is here so that callers can import from the auth package
directly (``from app.auth.passwords import hash_password, verify_password``)
instead of having to reach into ``app/api/endpoints/auth.py`` (1,091-line
god file before the architecture refactor).

Back-compat aliases:
    - ``ph``                    -> the underlying Argon2 hasher (was a module
                                   global in ``app/api/endpoints/auth.py``).
    - ``_normalize_password``   -> the legacy SHA-256 pre-hash helper, kept
                                   for code paths that still need to compare
                                   against historical Argon2-of-SHA256 rows.
"""

from __future__ import annotations

from app.utils.passwords import (
    VerifyResult,
    authenticate_and_maybe_rehash,
    hash_password,
    verify_password,
    _hasher as ph,
    _legacy_sha256_normalized as _normalize_password,
)


__all__ = [
    "hash_password",
    "verify_password",
    "authenticate_and_maybe_rehash",
    "VerifyResult",
    "ph",
    "_normalize_password",
]
