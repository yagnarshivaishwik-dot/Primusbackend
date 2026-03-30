"""
Signed license key utilities.

A signed license key is a JWT containing:
  - cafe_id: int
  - max_pcs: int
  - expires_at: ISO timestamp (or null for unlimited)
  - type: "license"

The JWT is signed with JWT_SECRET using HS256, so it is tamper-proof.
The raw JWT string is stored as the License.key in the DB, and verified
on every PC registration without requiring a round-trip for claims validation.

Backwards compatibility: plain (unsigned) license keys that pre-exist in the
DB are still looked up by exact string match and remain valid.
"""

from datetime import UTC, datetime
from typing import Any

from jose import JWTError, jwt

from app.config import ALGORITHM, JWT_SECRET

_LICENSE_TYPE = "license"


def create_signed_license_key(
    *,
    cafe_id: int,
    max_pcs: int,
    expires_at: datetime | None,
) -> str:
    """
    Generate a tamper-proof signed license key.

    Returns a JWT string that encodes cafe_id, max_pcs, and expiry.
    Store this string as License.key.
    """
    payload: dict[str, Any] = {
        "type": _LICENSE_TYPE,
        "cafe_id": cafe_id,
        "max_pcs": max_pcs,
        "issued_at": datetime.now(UTC).isoformat(),
    }
    if expires_at:
        # Normalise to UTC-aware
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        payload["expires_at"] = expires_at.isoformat()
    else:
        payload["expires_at"] = None

    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_signed_license_key(key: str) -> dict[str, Any] | None:
    """
    Decode and validate a signed license key JWT.

    Returns the decoded payload dict on success, or None if the key is
    not a valid signed license (plain/legacy keys return None — they must
    be validated via DB lookup instead).
    """
    try:
        payload = jwt.decode(key, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return None

    if payload.get("type") != _LICENSE_TYPE:
        return None

    return payload


def verify_signed_license(
    key: str,
    *,
    cafe_id: int | None = None,
) -> tuple[bool, str]:
    """
    Verify a signed license key is valid and not expired.

    Args:
        key: The license key string (JWT).
        cafe_id: If provided, also checks that the key belongs to this cafe.

    Returns:
        (is_valid, error_message) — error_message is empty on success.
    """
    payload = decode_signed_license_key(key)
    if payload is None:
        # Could be a legacy plain key — caller must fall back to DB lookup.
        return False, "not_signed"

    # Expiry check
    expires_at_str: str | None = payload.get("expires_at")
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at < datetime.now(UTC):
                return False, "License expired"
        except (ValueError, TypeError):
            return False, "Invalid expiry in license"

    # Cafe ownership check (optional)
    if cafe_id is not None and payload.get("cafe_id") != cafe_id:
        return False, "License does not belong to this cafe"

    return True, ""


def is_signed_key(key: str) -> bool:
    """Return True if the key looks like a signed JWT (has two dots)."""
    return key.count(".") == 2
