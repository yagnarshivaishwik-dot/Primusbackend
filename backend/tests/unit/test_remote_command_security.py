"""
Tests for remote command endpoint security including authorization and validation.
"""

import pytest

from app.api.endpoints.auth import create_access_token
from app.models import Cafe, ClientPC, License


@pytest.fixture
def test_pc(db_session):
    """Create a test PC."""
    # PC model requires unique name, so use timestamp to ensure uniqueness
    import time
    from datetime import UTC, datetime

    # PostgreSQL requires parent records
    cafe = Cafe(name=f"Test Cafe {int(time.time())}")
    db_session.add(cafe)
    db_session.flush()

    license = License(key="TEST-KEY", cafe_id=cafe.id, max_pcs=10, is_active=True)
    db_session.add(license)
    db_session.flush()

    pc = ClientPC(
        name=f"Test PC {int(time.time())}",
        status="available",
        last_seen=datetime.now(UTC),
        license_key="TEST-KEY",
        hardware_fingerprint=f"hw-{int(time.time())}",
        device_secret="secret-123",
        cafe_id=cafe.id,
    )
    db_session.add(pc)
    db_session.commit()
    db_session.refresh(pc)
    return pc


def test_remote_command_requires_admin(client, admin_user, regular_user, test_pc):
    """Test that remote command endpoint requires admin role."""
    # Get admin token
    admin_token = create_access_token({"sub": admin_user.email, "role": "admin"})

    # Get regular user token
    user_token = create_access_token({"sub": regular_user.email, "role": "client"})

    # Admin should be able to send command
    response = client.post(
        "/api/command/send",
        json={"pc_id": test_pc.id, "command": "shutdown", "params": None},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200

    # Regular user should be denied
    response = client.post(
        "/api/command/send",
        json={"pc_id": test_pc.id, "command": "shutdown", "params": None},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 403


def test_remote_command_validation_invalid_command(client, admin_user, test_pc):
    """Test that invalid commands are rejected."""
    admin_token = create_access_token({"sub": admin_user.email, "role": "admin"})

    # Try to send invalid command
    response = client.post(
        "/api/command/send",
        json={
            "pc_id": test_pc.id,
            "command": "rm -rf /",  # Invalid command
            "params": None,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400
    assert "Unsupported command" in response.json()["detail"]


def test_remote_command_validation_params_size(client, admin_user, test_pc):
    """Test that oversized params are rejected."""
    admin_token = create_access_token({"sub": admin_user.email, "role": "admin"})

    # Create oversized params (>10KB)
    large_params = "x" * 11000

    response = client.post(
        "/api/command/send",
        json={"pc_id": test_pc.id, "command": "message", "params": large_params},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400
    assert "too large" in response.json()["detail"].lower()
