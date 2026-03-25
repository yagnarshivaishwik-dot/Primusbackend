import string

from app.api.endpoints import screenshot as screenshot_module


def test_screenshot_fingerprint_uses_sha256_and_is_short_hex():
    content = b"example-screenshot-bytes"

    value = screenshot_module._fingerprint_content(content)

    # Should be 8 hex characters derived from SHA-256
    assert isinstance(value, str)
    assert len(value) == 8
    assert all(ch in string.hexdigits for ch in value)
