import importlib

import pytest


def _reload_database_module():
    """Reload app.database with current environment settings."""
    if "app.database" in list(importlib.sys.modules):
        del importlib.sys.modules["app.database"]
    return importlib.import_module("app.database")


def test_database_url_must_be_postgresql(monkeypatch):
    """
    DATABASE_URL must use the PostgreSQL scheme; non-PostgreSQL URLs should fail fast.
    """
    monkeypatch.setenv("DATABASE_URL", "mysql://user:pass@localhost:3306/primus")
    monkeypatch.setenv("ENVIRONMENT", "production")  # Explicitly set to prod to trigger validation

    with pytest.raises(SystemExit):
        # Importing app.config should validate DATABASE_URL and exit.
        importlib.reload(importlib.import_module("app.config"))
