"""Tests for security utility functions."""

from app.utils.security import (
    sanitize_csv_cell,
    sanitize_filename,
    sanitize_html,
    validate_email,
    validate_password_strength,
)


def test_sanitize_html():
    """Test HTML sanitization."""
    # XSS attempts should be escaped
    assert (
        sanitize_html("<script>alert('xss')</script>")
        == "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"
    )
    assert sanitize_html("<img src=x onerror=alert(1)>") == "&lt;img src=x onerror=alert(1)&gt;"

    # Normal text should pass through
    assert sanitize_html("Hello World") == "Hello World"

    # Empty string
    assert sanitize_html("") == ""
    assert sanitize_html(None) == ""


def test_sanitize_csv_cell():
    """Test CSV injection prevention."""
    # Formula injection attempts should be prefixed
    assert sanitize_csv_cell("=cmd|'/c calc'!A0") == "'=cmd|'/c calc'!A0"
    assert sanitize_csv_cell("+cmd|'/c calc'!A0") == "'+cmd|'/c calc'!A0"
    assert sanitize_csv_cell("-cmd|'/c calc'!A0") == "'-cmd|'/c calc'!A0"
    assert sanitize_csv_cell("@SUM(1+1)*cmd|'/c calc'!A0") == "'@SUM(1+1)*cmd|'/c calc'!A0"

    # Normal cells should pass through
    assert sanitize_csv_cell("John Doe") == "John Doe"
    assert sanitize_csv_cell("12345") == "12345"

    # Empty string
    assert sanitize_csv_cell("") == ""


def test_validate_email():
    """Test email validation."""
    # Valid emails
    assert validate_email("user@example.com") is True
    assert validate_email("test.user+tag@example.co.uk") is True
    assert validate_email("user123@test-domain.com") is True

    # Invalid emails
    assert validate_email("invalid") is False
    assert validate_email("@example.com") is False
    assert validate_email("user@") is False
    assert validate_email("user@example") is False
    assert validate_email("") is False
    assert validate_email(None) is False


def test_validate_password_strength():
    """Test password strength validation."""
    # Valid password
    is_valid, error = validate_password_strength("SecurePass123")
    assert is_valid is True
    assert error is None

    # Too short
    is_valid, error = validate_password_strength("Short1")
    assert is_valid is False
    assert "8 characters" in error

    # Missing uppercase
    is_valid, error = validate_password_strength("lowercase123")
    assert is_valid is False
    assert "uppercase" in error

    # Missing lowercase
    is_valid, error = validate_password_strength("UPPERCASE123")
    assert is_valid is False
    assert "lowercase" in error

    # Missing number
    is_valid, error = validate_password_strength("NoNumbers")
    assert is_valid is False
    assert "number" in error

    # Empty password
    is_valid, error = validate_password_strength("")
    assert is_valid is False
    assert "required" in error


def test_sanitize_filename():
    """Test filename sanitization."""
    # Path traversal attempts should be removed
    assert ".." not in sanitize_filename("../../../etc/passwd")
    assert "/" not in sanitize_filename("path/to/file.txt")
    assert "\\" not in sanitize_filename("path\\to\\file.txt")

    # Normal filenames should pass through
    assert sanitize_filename("image.png") == "image.png"
    assert sanitize_filename("document.pdf") == "document.pdf"

    # Null bytes should be removed
    assert "\x00" not in sanitize_filename("file\x00name.txt")

    # Empty filename should return default
    assert sanitize_filename("") == "unnamed"
