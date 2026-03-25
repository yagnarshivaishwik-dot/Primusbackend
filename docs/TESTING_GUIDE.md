# Testing Guide

**Last Updated:** 2024-12-01

---

## Running Tests

### Prerequisites

```bash
cd backend
pip install -r requirements-dev.txt
```

### Run All Tests

```bash
pytest tests/ -v
```

### Run Specific Test File

```bash
pytest tests/test_account_lockout.py -v
pytest tests/unit/test_wallet_security.py -v
```

### Run Tests with Coverage

```bash
pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
```

This generates:
- Terminal output with coverage summary
- HTML report in `htmlcov/index.html`

---

## Test Structure

```
backend/tests/
├── __init__.py
├── conftest.py              # Shared fixtures
├── test_account_lockout.py  # Account lockout tests
├── test_csrf.py             # CSRF protection tests
├── test_security_utils.py   # Security utility tests
└── unit/
    ├── test_config_security.py      # Config security tests
    ├── test_csv_import_security.py  # CSV import security tests
    ├── test_file_upload_security.py # File upload security tests
    ├── test_main_security.py        # Main app security tests
    ├── test_wallet_security.py      # Wallet security tests
    └── test_webhook_security.py     # Webhook security tests
```

---

## Test Coverage Goals

- **Critical Security Features:** 100% coverage
- **Authentication/Authorization:** >90% coverage
- **Input Validation:** >90% coverage
- **Overall:** >80% coverage

---

## Writing New Tests

### Example Test Structure

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_example_endpoint():
    """Test description."""
    response = client.get("/api/example")
    assert response.status_code == 200
    assert "data" in response.json()
```

### Security Test Example

```python
def test_unauthorized_access():
    """Test that unauthorized users cannot access admin endpoint."""
    response = client.post("/api/admin/endpoint", headers={})
    assert response.status_code == 401

def test_admin_only_endpoint():
    """Test that only admins can access admin endpoint."""
    # Login as regular user
    login_response = client.post("/api/auth/login", data={
        "username": "user@example.com",
        "password": "password"
    })
    token = login_response.json()["access_token"]
    
    # Try to access admin endpoint
    response = client.post(
        "/api/admin/endpoint",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
```

---

## Continuous Integration

Tests run automatically on:
- Pull requests to `main` branch
- Pushes to `main` branch
- Scheduled nightly runs

See `.github/workflows/ci.yml` for CI configuration.

---

## Troubleshooting

### Tests Fail with Import Errors

```bash
# Ensure you're in the backend directory
cd backend

# Install dependencies
pip install -r requirements-dev.txt

# Set PYTHONPATH if needed
export PYTHONPATH=$PWD:$PYTHONPATH
```

### Database Connection Errors

Tests use SQLite by default. If you see PostgreSQL errors:

```bash
# Set test database URL
export DATABASE_URL=postgresql+psycopg2://primus_user:CHANGE_ME@localhost:5432/primus_test_db
pytest tests/ -v
```

### Missing Environment Variables

Tests use test defaults. If you see missing env var errors:

```bash
# Create test .env file
cp env.example .env.test
# Edit .env.test with test values
export ENV_FILE=.env.test
pytest tests/ -v
```

---

## Test Data

Test fixtures are defined in `tests/conftest.py`. Common fixtures:

- `test_db`: Database session for tests
- `test_client`: FastAPI test client
- `admin_user`: Admin user fixture
- `regular_user`: Regular user fixture

---

## Performance Testing

For load testing (not included in standard test suite):

```bash
# Install locust
pip install locust

# Run load tests
locust -f tests/load_test.py
```

---

## Security Testing

Security tests verify:

- ✅ Authentication and authorization
- ✅ Input validation and sanitization
- ✅ CSRF protection
- ✅ Rate limiting
- ✅ Account lockout
- ✅ File upload security
- ✅ SQL injection prevention
- ✅ XSS prevention

---

**For more information, see individual test files.**

