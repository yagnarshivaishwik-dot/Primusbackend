"""
Tests to ensure authentication endpoints don't leak user existence information.
"""

import bcrypt
import pytest


@pytest.fixture
def existing_user(db_session):
    """Create an existing user."""
    from app.models import User

    password = "SecurePass123!"
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user = User(
        email="existing@test.com", password_hash=password_hash, role="client", name="Existing User"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_registration_does_not_reveal_user_existence(client, existing_user):
    """Test that registration doesn't reveal if user already exists."""
    # Try to register with existing email
    # Use a password that meets complexity requirements: uppercase, lowercase, number, min 8 chars
    # Use form data because the endpoint supports both JSON body and form,
    # and tests should exercise the public form-based registration flow.
    response = client.post(
        "/api/auth/register",
        data={
            "name": "New User",
            "email": existing_user.email,  # Already exists
            "password": "SecurePass123!",  # Meets requirements: uppercase, lowercase, number, special char
            "role": "client",
        },
    )

    # The endpoint should return {"ok": True} with status 200 when user exists
    # This prevents user enumeration by not revealing that the user already exists
    # Password validation happens first, so password must be valid
    # If password is valid and user exists, we should get 200 with {"ok": True}
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    response_data = response.json()
    # The endpoint returns {"ok": True} when user exists to prevent enumeration
    assert "ok" in response_data or response_data.get("ok") is True, (
        f"Response should contain 'ok': {response_data}"
    )


def test_login_returns_generic_error(client, existing_user):
    """Test that login returns generic error message (doesn't reveal user existence)."""
    # Try to login with non-existent user
    response = client.post(
        "/api/auth/login", data={"username": "nonexistent@test.com", "password": "wrongpassword"}
    )

    # Should return generic "Invalid credentials" message
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]

    # Try to login with wrong password for existing user
    # The error should be the same to prevent user enumeration
    response2 = client.post(
        "/api/auth/login", data={"username": existing_user.email, "password": "wrongpassword123"}
    )

    # Should return same generic error
    assert response2.status_code == 401
    assert "Invalid credentials" in response2.json()["detail"]
