"""
Tests for wallet endpoint security fixes.
Tests CRIT-008: Wallet topup authorization and validation.
"""


def test_wallet_topup_requires_admin(client, admin_token, user_token, db_session):
    """Test that wallet topup requires admin role."""
    # Regular user should be denied
    response = client.post(
        "/api/wallet/topup",
        json={"amount": 100, "type": "topup", "description": "Test topup"},
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 403
    assert "admin" in response.json()["detail"].lower()

    # Admin should be allowed
    response = client.post(
        "/api/wallet/topup",
        json={"amount": 100, "type": "topup", "description": "Test topup"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200


def test_wallet_topup_amount_validation(client, admin_token):
    """Test wallet topup amount validation."""
    # Negative amount should be rejected
    response = client.post(
        "/api/wallet/topup",
        json={"amount": -100, "type": "topup", "description": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    # Zero amount should be rejected
    response = client.post(
        "/api/wallet/topup",
        json={"amount": 0, "type": "topup", "description": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    # Amount exceeding max should be rejected
    response = client.post(
        "/api/wallet/topup",
        json={"amount": 20000, "type": "topup", "description": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400

    # Valid amount should succeed
    response = client.post(
        "/api/wallet/topup",
        json={"amount": 1000, "type": "topup", "description": "Test"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
