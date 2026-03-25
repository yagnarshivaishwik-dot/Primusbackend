"""
Security utility functions for input validation and sanitization.
"""

import hashlib
import hmac
import html
import re
import time

from fastapi import HTTPException, Request


def verify_device_signature(request: Request, body: bytes, device_secret: str, device_id: str = None):
    """
    MASTER SYSTEM: Verify HMAC signature for device requests.
    Prevents spoofing and replay attacks using nonce caching.
    
    Args:
        request: FastAPI request object
        body: Request body bytes
        device_secret: Device's HMAC secret
        device_id: Device identifier for nonce scoping
    """
    signature = request.headers.get("X-Device-Signature")
    timestamp = request.headers.get("X-Device-Timestamp")  # Unix timestamp
    nonce = request.headers.get("X-Device-Nonce")  # Random string

    if not all([signature, timestamp, nonce]):
        raise HTTPException(status_code=401, detail="Missing security headers")

    # 1. Prevent Replays (5 minute window)
    try:
        ts_int = int(timestamp)
        now = int(time.time())
        if abs(now - ts_int) > 300:
            raise HTTPException(status_code=401, detail="Request expired (clock drift?)")
    except ValueError as err:
        raise HTTPException(status_code=401, detail="Invalid timestamp") from err

    # 2. Verify HMAC
    # Payload = method + path + timestamp + nonce + body
    message = f"{request.method}{request.url.path}{timestamp}{nonce}".encode() + body
    expected_sig = hmac.new(device_secret.encode(), message, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 3. REPLAY PROTECTION: Check and store nonce
    nonce_key = f"nonce:{device_id or 'global'}:{nonce}"
    
    # Try Redis first, fall back to in-memory if not available
    if _check_and_store_nonce_redis(nonce_key):
        raise HTTPException(status_code=401, detail="Replay detected: nonce already used")
    elif _check_and_store_nonce_memory(nonce_key):
        raise HTTPException(status_code=401, detail="Replay detected: nonce already used")


# In-memory nonce cache (fallback if Redis unavailable)
_nonce_cache: dict[str, float] = {}
_NONCE_TTL = 310  # 5 minutes + 10 second buffer


def _check_and_store_nonce_memory(nonce_key: str) -> bool:
    """
    Check if nonce exists in memory cache. Returns True if DUPLICATE (reject).
    """
    global _nonce_cache
    now = time.time()
    
    # Cleanup expired entries periodically
    if len(_nonce_cache) > 10000:
        _nonce_cache = {k: v for k, v in _nonce_cache.items() if now - v < _NONCE_TTL}
    
    if nonce_key in _nonce_cache:
        if now - _nonce_cache[nonce_key] < _NONCE_TTL:
            return True  # Duplicate
        # Expired, allow reuse
    
    _nonce_cache[nonce_key] = now
    return False


def _check_and_store_nonce_redis(nonce_key: str) -> bool | None:
    """
    Check and store nonce in Redis. Returns True if DUPLICATE, False if new, None if Redis unavailable.
    """
    try:
        import redis
        import os
        
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(redis_url, decode_responses=True)
        
        # SETNX returns True if key was set (new nonce), False if exists (duplicate)
        was_set = r.setnx(nonce_key, "1")
        if was_set:
            r.expire(nonce_key, _NONCE_TTL)
            return False  # New nonce, allow
        return True  # Duplicate, reject
        
    except Exception:
        # Redis unavailable, return None to fall back to memory
        return None


def sanitize_html(text: str) -> str:
    """
    Sanitize HTML content by escaping special characters.
    Prevents XSS attacks when rendering user-generated content.

    Args:
        text: Input text that may contain HTML

    Returns:
        Escaped HTML-safe string
    """
    if not text:
        return ""
    return html.escape(str(text))


def sanitize_csv_cell(cell: str) -> str:
    """
    Prevent CSV injection by prefixing dangerous characters with single quote.

    Args:
        cell: CSV cell content

    Returns:
        Sanitized cell content
    """
    if not cell:
        return ""
    cell = str(cell).strip()
    # Prevent formula injection
    if cell.startswith(("=", "+", "-", "@")):
        return "'" + cell
    return cell


def validate_email(email: str) -> bool:
    """
    Validate email format using regex.

    Args:
        email: Email address to validate

    Returns:
        True if valid email format, False otherwise
    """
    if not email:
        return False
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    """
    Validate password strength.

    Args:
        password: Password to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password is required"

    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    # Enforce a sane maximum length that is well below bcrypt's 72‑byte
    # internal limit, while still allowing strong passphrases.
    if len(password) > 32:
        return False, "Password must be at most 32 characters long"

    # Check for at least one uppercase letter
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    # Check for at least one lowercase letter
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"

    # Check for at least one number
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number"

    return True, None


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent path traversal attacks.

    Args:
        filename: Original filename

    Returns:
        Sanitized filename safe for filesystem use
    """
    if not filename:
        return "unnamed"

    # Remove path components
    filename = filename.replace("..", "").replace("/", "").replace("\\", "")

    # Remove null bytes
    filename = filename.replace("\x00", "")

    # Limit length
    if len(filename) > 255:
        filename = filename[:255]

    return filename
