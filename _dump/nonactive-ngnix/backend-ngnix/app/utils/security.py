"""
Security utility functions for input validation and sanitization.
"""

import html
import re


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

    if len(password) > 128:
        return False, "Password must be less than 128 characters"

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
