"""
Tests for webhook endpoint security fixes.
Tests HIGH-002: Webhook listing authorization.
"""


def test_webhook_list_requires_admin(client, admin_token, user_token):
    """Test that webhook listing requires admin role."""
    # Regular user should be denied
    response = client.get("/api/webhook/", headers={"Authorization": f"Bearer {user_token}"})
    assert response.status_code == 403

    # Admin should be allowed
    response = client.get("/api/webhook/", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
