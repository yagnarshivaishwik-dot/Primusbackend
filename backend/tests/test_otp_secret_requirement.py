import importlib
from unittest.mock import patch

import pytest


def _reload_config():
    """
    Helper to reload app.config with current environment.

    This allows us to simulate different ENVIRONMENT / APP_SECRET values and
    assert that the configuration helper enforces the expected behaviour.
    """

    if "app.config" in list(importlib.sys.modules):
        del importlib.sys.modules["app.config"]
    return importlib.import_module("app.config")


def test_app_secret_required_in_production(monkeypatch):
    """APP_SECRET must be set in production; missing value should exit."""
    import app.config

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("APP_SECRET", raising=False)

    with patch.object(app.config, "IS_PRODUCTION", True):
        with pytest.raises(SystemExit):
            app.config._require_env_var(
                "APP_SECRET",
                "OTP/email verification HMAC secret",
                allow_dev_default=True,
            )


def test_app_secret_dev_default_allowed_in_development(monkeypatch):
    """In development, APP_SECRET may fall back to a dev default."""
    import app.config

    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg2://user:pass@localhost:5432/test_db")
    monkeypatch.delenv("APP_SECRET", raising=False)

    with patch.object(app.config, "IS_PRODUCTION", False):
        with patch.object(app.config, "IS_DEVELOPMENT", True):
            value = app.config._require_env_var(
                "APP_SECRET",
                "OTP/email verification HMAC secret",
                allow_dev_default=True,
            )
            assert isinstance(value, str)
            assert "app-secret" in value
