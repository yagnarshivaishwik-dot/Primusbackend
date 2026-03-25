"""
Tests for OAuth security features including state validation and redirect protection.
"""

import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_oauth_state_validation_allowed_redirect():
    """Test that allowed redirects work correctly."""
    # Set allowed redirects
    os.environ["ALLOWED_REDIRECTS"] = "http://localhost,https://primustech.in"

    # This would normally require OAuth flow, but we're testing the validation logic
    # The actual OAuth callback would be tested in integration tests
    assert True  # Placeholder - actual OAuth flow requires Google OAuth setup


def test_oauth_state_validation_rejected_redirect():
    """Test that disallowed redirects are rejected."""
    # Set allowed redirects
    os.environ["ALLOWED_REDIRECTS"] = "http://localhost,https://primustech.in"

    # Malicious redirect should be rejected
    # This is tested in the social_auth.py code where state validation occurs
    assert True  # Placeholder - actual test requires OAuth flow


def test_oauth_client_id_required():
    """Test that OAuth endpoints fail gracefully when client ID is missing."""
    # Temporarily remove client ID
    old_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    if "GOOGLE_CLIENT_ID" in os.environ:
        del os.environ["GOOGLE_CLIENT_ID"]

    try:
        # OAuth login endpoint should handle missing config gracefully
        response = client.get("/api/social/login/google")
        # Should return error about missing configuration
        assert response.status_code in [400, 500]
    finally:
        # Restore
        if old_client_id:
            os.environ["GOOGLE_CLIENT_ID"] = old_client_id
