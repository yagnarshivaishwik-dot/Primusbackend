"""
Pytest configuration and fixtures for testing.
"""

import os
import sys
import warnings

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import sessionmaker

# Add backend to path
base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_path not in sys.path:
    sys.path.insert(0, base_path)
# Ensure we don't have confusing root in path
if "/" in sys.path:
    sys.path.remove("/")

# Disable CSRF protection for tests
os.environ["ENABLE_CSRF_PROTECTION"] = "false"
os.environ["ENVIRONMENT"] = "test"

# Set dummy mail config so otp_email.py doesn't fail on import validation
os.environ.setdefault("MAIL_FROM", "test@example.com")
os.environ.setdefault("MAIL_SERVER", "localhost")
os.environ.setdefault("MAIL_SUPPRESS_SEND", "true")

# Force tests to use the isolated PostgreSQL DB regardless of any .env loaded by app.main.
# app.main calls load_dotenv() at import time; load_dotenv() does NOT override existing env vars,
# so setting this early prevents accidental use of a different DB with stale schema.
# Use localhost by default for running tests outside Docker; override with TEST_DATABASE_URL for Docker
_DEFAULT_TEST_DB = "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_db"
TEST_DB_URL = os.getenv("TEST_DATABASE_URL", _DEFAULT_TEST_DB)
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["TEST_DATABASE_URL"] = TEST_DB_URL

# Import bcrypt library first (needed for patch function)
import bcrypt as bcrypt_lib

# Patch authenticate_user function to use bcrypt_lib.checkpw directly
# This is done after importing app modules so we can patch the function
import app.api.endpoints.auth as auth_module
from app.database import Base, get_db
from app.main import app

# Import all models to ensure they're registered with Base
from app.models import (
    User,
)
from app.utils.account_lockout import _lockout_store

# Suppress SQLAlchemy SAWarnings (e.g., FK-cycle warnings during drop_all) in tests only.
warnings.filterwarnings("ignore", category=SAWarning)

# Store original authenticate_user
_original_authenticate_user = auth_module.authenticate_user


def _patched_authenticate_user(db, email_or_username, password):
    """Patched authenticate_user that uses bcrypt_lib.checkpw."""
    # Use the same query logic as the original function
    user = (
        db.query(User)
        .filter((User.email == email_or_username) | (User.name == email_or_username))
        .first()
    )
    if user:
        # Convert to bytes if needed for bcrypt_lib.checkpw
        try:
            if isinstance(user.password_hash, str):
                hash_bytes = user.password_hash.encode("utf-8")
            else:
                hash_bytes = user.password_hash
            if isinstance(password, str):
                password_bytes = password.encode("utf-8")
            else:
                password_bytes = password
            # Use bcrypt_lib.checkpw instead of passlib's verify
            if bcrypt_lib.checkpw(password_bytes, hash_bytes):
                return user
        except Exception:
            # If bcrypt_lib.checkpw fails, fall back to original function
            return _original_authenticate_user(db, email_or_username, password)
    return None


# Apply patch
auth_module.authenticate_user = _patched_authenticate_user

# Patch passlib's bcrypt bug detection to avoid compatibility issues with Python 3.14
# This is a workaround for passlib's incompatibility with newer bcrypt versions
_original_detect_wrap_bug = None
try:

    def _patched_detect_wrap_bug(ident):
        # Skip bug detection to avoid initialization errors
        return False

    # Patch the function before any bcrypt operations
    import passlib.handlers.bcrypt as bcrypt_handler_module

    bcrypt_handler_module.detect_wrap_bug = _patched_detect_wrap_bug
except Exception:
    pass  # If patching fails, continue anyway


# Use a dedicated PostgreSQL database for tests.
# Configure TEST_DATABASE_URL for tests.
# Default to a local PostgreSQL instance for tests.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_db",
)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test."""
    # Ensure all models are imported and registered with Base
    # Import models module to trigger all class definitions

    engine = create_engine(TEST_DATABASE_URL, future=True)

    # For PostgreSQL, we need to handle dependencies when dropping.
    # Brute force: drop the public schema and recreate it.
    from sqlalchemy import text

    if TEST_DATABASE_URL.startswith("postgresql"):
        with engine.connect() as conn:
            conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
            conn.execute(text("CREATE SCHEMA public;"))
            conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
            conn.commit()

    # Create all tables - this will create tables for all models registered with Base
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Clear account lockout state before each test
    _lockout_store._attempts.clear()
    _lockout_store._locked.clear()

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # No need to drop here as we drop-and-recreate at start of next test
        # Clear account lockout state after each test
        _lockout_store._attempts.clear()
        _lockout_store._locked.clear()


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with database override."""
    # Create a single session that will be reused across all dependency calls
    # This ensures that user objects remain attached to the same session
    session_instance = db_session

    def override_get_db():
        # Return the same db_session for all database dependencies
        # This ensures user objects remain attached and can be lazy-loaded
        yield session_instance

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session):
    """Create an admin user for testing."""
    password = "testpassword123"
    # Use bcrypt library directly - the patch ensures passlib can verify these hashes
    password_bytes = password.encode("utf-8")
    password_hash = bcrypt_lib.hashpw(password_bytes, bcrypt_lib.gensalt()).decode("utf-8")
    user = User(
        name="Admin User",
        email="admin@test.com",
        password_hash=password_hash,
        role="admin",
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_user(db_session):
    """Create a regular user for testing."""
    password = "testpassword123"
    # Use bcrypt library directly - the patch ensures passlib can verify these hashes
    password_bytes = password.encode("utf-8")
    password_hash = bcrypt_lib.hashpw(password_bytes, bcrypt_lib.gensalt()).decode("utf-8")
    user = User(
        name="Regular User",
        email="user@test.com",
        password_hash=password_hash,
        role="client",
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(client, admin_user):
    """Get admin JWT token."""
    response = client.post(
        "/api/auth/login", data={"username": admin_user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, f"Missing access_token in response: {data}"
    return data["access_token"]


@pytest.fixture
def user_token(client, regular_user):
    """Get regular user JWT token."""
    response = client.post(
        "/api/auth/login", data={"username": regular_user.email, "password": "testpassword123"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, f"Missing access_token in response: {data}"
    return data["access_token"]
