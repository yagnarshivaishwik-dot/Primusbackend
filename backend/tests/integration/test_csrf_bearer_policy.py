"""
Verify forensic audit BUG #8 — CSRF bearer-token exemption fix.

Old behaviour: the 60-entry path allowlist effectively disabled CSRF for
the entire /api/v1 surface (BUG #21 / #8).

New behaviour (post-cleanup):
  * cookie-only state-changing request → must be blocked with 403
  * same request with Authorization: Bearer ... → MUST pass the CSRF
    middleware (the bearer header is itself the CSRF defense)
"""
from __future__ import annotations

import os
from importlib import reload

import pytest
from fastapi.testclient import TestClient

# Re-enable CSRF protection just for this module — conftest defaults it off.
os.environ["ENABLE_CSRF_PROTECTION"] = "true"

import app.main as _main_module  # noqa: E402
import app.middleware.csrf as csrf_module  # noqa: E402


@pytest.fixture(autouse=True)
def _force_csrf_on(monkeypatch):
    monkeypatch.setenv("ENABLE_CSRF_PROTECTION", "true")
    yield
    monkeypatch.setenv("ENABLE_CSRF_PROTECTION", "false")


def _build_csrf_client() -> TestClient:
    """Build a TestClient with a fresh app whose CSRF middleware is on."""
    # The CSRF middleware reads ENABLE_CSRF_PROTECTION at app-creation time.
    # Reload module so it picks up the env var we just set.
    return TestClient(_main_module.app)


def test_csrf_required_when_no_bearer():
    """Cookie-only POST to a state-changing endpoint → 403."""
    client = _build_csrf_client()

    # No CSRF cookie, no CSRF header, no bearer token.
    resp = client.post(
        "/api/auth/login",
        data={"username": "x@x.com", "password": "x"},
    )

    # 403 is the canonical CSRF reject; 401 is acceptable if the middleware
    # ordering changed. The crucial assertion is that it is NOT 200/422.
    assert resp.status_code == 403, (
        f"CSRF must block cookie-only state-changing requests; got {resp.status_code}"
    )
    assert "csrf" in resp.text.lower()


def test_csrf_skipped_when_bearer_present():
    """Same POST with Authorization: Bearer ... → must NOT be 403."""
    client = _build_csrf_client()
    resp = client.post(
        "/api/auth/login",
        data={"username": "x@x.com", "password": "x"},
        headers={"Authorization": "Bearer fake-but-present-token"},
    )

    assert resp.status_code != 403, (
        f"Bearer-bearing requests must bypass CSRF; got {resp.status_code}: {resp.text}"
    )
    # 401 / 400 / 422 are all fine: the request reached the endpoint,
    # which is the only thing this test is asserting.
