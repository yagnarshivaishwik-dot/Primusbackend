"""
Tests for configuration security fixes.
Tests CRIT-003, CRIT-004: JWT secret and SECRET_KEY validation.
"""

from unittest.mock import patch

import pytest


def test_jwt_secret_required_in_production(monkeypatch):
    """Test that JWT_SECRET is required in production."""
    import app.config

    # Set production environment and clear JWT_SECRET
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("JWT_SECRET", raising=False)

    # Mock IS_PRODUCTION to be True
    with patch.object(app.config, "IS_PRODUCTION", True):
        # The function should raise SystemExit in production when var is missing
        with pytest.raises(SystemExit):
            app.config._require_env_var(
                "JWT_SECRET", "JWT token signing secret", allow_dev_default=True
            )


def test_secret_key_required_in_production(monkeypatch):
    """Test that SECRET_KEY is required in production."""
    import app.config

    # Set production environment and clear SECRET_KEY
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)

    # Mock IS_PRODUCTION to be True
    with patch.object(app.config, "IS_PRODUCTION", True):
        # The function should raise SystemExit in production when var is missing
        with pytest.raises(SystemExit):
            app.config._require_env_var(
                "SECRET_KEY",
                "Application secret key for session management",
                allow_dev_default=True,
            )


def test_jwt_secret_allows_dev_default(monkeypatch):
    """Test that JWT_SECRET allows a dev default in development environments."""
    import app.config

    # Set development environment with a PostgreSQL DATABASE_URL
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/test_db")
    monkeypatch.delenv("JWT_SECRET", raising=False)

    # Mock IS_PRODUCTION to be False and IS_DEVELOPMENT to be True
    with patch.object(app.config, "IS_PRODUCTION", False):
        with patch.object(app.config, "IS_DEVELOPMENT", True):
            # Should return dev default
            result = app.config._require_env_var(
                "JWT_SECRET", "JWT token signing secret", allow_dev_default=True
            )
            # The default format is "dev-{var_name.lower().replace('_', '-')}-change-in-production"
            assert result == "dev-jwt-secret-change-in-production"
