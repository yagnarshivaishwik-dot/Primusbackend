"""
Tests for main.py security fixes.
Tests CRIT-007: Datetime import fix.
"""


def test_health_endpoint_works(client):
    """Test that health endpoint works without errors."""
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert response.json()["status"] == "ok"
    assert "timestamp" in response.json()
