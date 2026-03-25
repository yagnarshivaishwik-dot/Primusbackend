"""Tests for CSRF protection."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_csrf_token_generation():
    """Test CSRF token generation."""
    from app.utils.csrf import generate_csrf_token

    token1 = generate_csrf_token()
    token2 = generate_csrf_token()

    assert len(token1) > 0
    assert len(token2) > 0
    assert token1 != token2  # Tokens should be unique


def test_csrf_token_verification():
    """Test CSRF token verification."""
    from app.utils.csrf import generate_csrf_token, verify_csrf_token

    token = generate_csrf_token()

    # Valid token should verify
    assert verify_csrf_token(token, token) is True

    # Different tokens should not verify
    token2 = generate_csrf_token()
    assert verify_csrf_token(token, token2) is False

    # Empty tokens should not verify
    assert verify_csrf_token("", "") is False
    assert verify_csrf_token(token, "") is False


def test_csrf_skip_safe_methods():
    """Test that safe methods skip CSRF check."""
    from fastapi import Request

    from app.utils.csrf import should_skip_csrf_check

    # GET request should skip
    scope = {"type": "http", "method": "GET", "path": "/api/test", "headers": []}
    request = Request(scope)
    assert should_skip_csrf_check(request) is True

    # POST request should not skip
    scope = {"type": "http", "method": "POST", "path": "/api/test", "headers": []}
    request = Request(scope)
    assert should_skip_csrf_check(request) is False


def test_csrf_skip_health_endpoint():
    """Test that health endpoint skips CSRF check."""
    from fastapi import Request

    from app.utils.csrf import should_skip_csrf_check

    scope = {"type": "http", "method": "POST", "path": "/health", "headers": []}
    request = Request(scope)
    assert should_skip_csrf_check(request) is True
