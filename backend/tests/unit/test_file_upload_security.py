"""
Tests for file upload security fixes.
Tests CRIT-009: File upload validation.
"""

import io
from app.models import ClientPC, Cafe, License


def setup_pc(db_session):
    cafe = Cafe(name="Test Cafe")
    db_session.add(cafe)
    db_session.flush()

    license = License(key="TEST-KEY", cafe_id=cafe.id, max_pcs=10, is_active=True)
    db_session.add(license)
    db_session.flush()

    pc = ClientPC(id=1, name="Test PC", cafe_id=cafe.id, license_key="TEST-KEY")
    db_session.add(pc)
    db_session.commit()


def test_screenshot_upload_size_limit(client, db_session, admin_token):
    """Test that file uploads respect size limits."""
    setup_pc(db_session)
    # Create a file larger than 10MB
    large_content = b"x" * (11 * 1024 * 1024)  # 11MB

    response = client.post(
        "/api/screenshot/upload/1",
        files={"file": ("test.png", io.BytesIO(large_content), "image/png")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_screenshot_upload_file_type_validation(client, db_session, admin_token):
    """Test that only allowed file types are accepted."""
    setup_pc(db_session)
    # Try uploading a PHP file disguised as PNG
    php_content = b"<?php echo 'malicious'; ?>"

    response = client.post(
        "/api/screenshot/upload/1",
        files={"file": ("test.php", io.BytesIO(php_content), "application/x-php")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400
    assert "invalid file type" in response.json()["detail"].lower()


def test_screenshot_upload_path_traversal_prevention(client, db_session, admin_token):
    """Test that path traversal attempts are prevented."""
    setup_pc(db_session)
    # Create valid PNG content
    png_content = b"\x89PNG\r\n\x1a\n" + b"x" * 100

    # Try path traversal in filename
    response = client.post(
        "/api/screenshot/upload/1",
        files={"file": ("../../../etc/passwd.png", io.BytesIO(png_content), "image/png")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    # Should sanitize filename and still work, but not write to /etc/passwd
    assert response.status_code == 200
    # Verify filename was sanitized
    assert "etc" not in response.json()["image_url"]
    assert "passwd" not in response.json()["image_url"]
