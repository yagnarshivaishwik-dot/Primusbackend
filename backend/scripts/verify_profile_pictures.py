#!/usr/bin/env python3
"""End-to-end smoke test for the Persistent Profile Picture System.

Runs the full lifecycle:
    login → GET /api/profile → upload → GET → DELETE → GET

against a deployed API (defaults to ``http://localhost:8000``).

The test image is generated in-memory with Pillow so the script has no
disk-side dependencies.

Usage:
    python scripts/verify_profile_pictures.py \
        --base-url https://api.primustech.in \
        --email vaishwik@example.com \
        --password '<your-password>'

Exit codes: 0 = all good, non-zero = a step failed.
"""
from __future__ import annotations

import argparse
import io
import os
import sys
from typing import Any

try:
    import requests
except ImportError as exc:  # pragma: no cover
    sys.exit("This script needs `requests` (pip install requests)") from exc

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    sys.exit("This script needs Pillow (pip install pillow)") from exc


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base-url", default=os.getenv("PRIMUS_API_BASE", "http://localhost:8000"))
    p.add_argument("--email", default=os.getenv("PRIMUS_TEST_EMAIL"), required=False)
    p.add_argument("--password", default=os.getenv("PRIMUS_TEST_PASSWORD"), required=False)
    p.add_argument("--token", default=os.getenv("PRIMUS_TEST_TOKEN"),
                   help="Bearer token. Skips login if provided.")
    p.add_argument("--keep", action="store_true",
                   help="Skip the DELETE step so you can eyeball the upload.")
    return p.parse_args()


def color(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m"


def step(msg: str) -> None:
    print(color("▸ " + msg, "1;36"))


def ok(msg: str) -> None:
    print(color("✓ " + msg, "1;32"))


def fail(msg: str) -> None:
    print(color("✗ " + msg, "1;31"), file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Test image
# ---------------------------------------------------------------------------


def make_test_image() -> tuple[bytes, str]:
    """Generate a 256x256 PNG in memory."""
    img = Image.new("RGB", (256, 256), color=(99, 102, 241))
    # Diagonal stripe so a human eyeball can confirm it rendered.
    for x in range(256):
        img.putpixel((x, x), (255, 255, 255))
        if x + 1 < 256:
            img.putpixel((x + 1, x), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------


def login(base_url: str, email: str, password: str) -> str:
    step(f"POST {base_url}/api/auth/login")
    resp = requests.post(
        f"{base_url}/api/auth/login",
        data={"username": email, "password": password},
        timeout=15,
    )
    if not resp.ok:
        fail(f"Login failed ({resp.status_code}): {resp.text[:200]}")
    token = resp.json().get("access_token")
    if not token:
        fail("Login response had no access_token")
    ok("Got access token")
    return token


def get_profile(base_url: str, headers: dict[str, str]) -> dict[str, Any]:
    step(f"GET {base_url}/api/profile")
    resp = requests.get(f"{base_url}/api/profile", headers=headers, timeout=15)
    if not resp.ok:
        fail(f"GET /api/profile failed ({resp.status_code}): {resp.text[:200]}")
    data = resp.json()
    ok(f"Profile: id={data.get('id')} email={data.get('email')} pic={data.get('profile_picture_url')}")
    return data


def upload(base_url: str, headers: dict[str, str], png: bytes, mime: str) -> dict[str, Any]:
    step(f"POST {base_url}/api/profile/upload-picture")
    files = {"file": ("smoke-test.png", png, mime)}
    resp = requests.post(
        f"{base_url}/api/profile/upload-picture",
        headers=headers,
        files=files,
        timeout=30,
    )
    if not resp.ok:
        fail(f"Upload failed ({resp.status_code}): {resp.text[:200]}")
    data = resp.json()
    if not data.get("success") or not data.get("profile_picture_url"):
        fail(f"Upload response malformed: {data}")
    ok(f"Uploaded → {data['profile_picture_url']}")
    return data


def delete(base_url: str, headers: dict[str, str]) -> None:
    step(f"DELETE {base_url}/api/profile/picture")
    resp = requests.delete(f"{base_url}/api/profile/picture", headers=headers, timeout=15)
    if not resp.ok:
        fail(f"DELETE /api/profile/picture failed ({resp.status_code}): {resp.text[:200]}")
    ok("Deleted")


def fetch_image(url: str) -> int:
    step(f"GET {url}  (download to confirm it's reachable)")
    resp = requests.get(url, timeout=20)
    if not resp.ok:
        fail(f"Image fetch failed ({resp.status_code})")
    ok(f"Image is reachable ({len(resp.content)} bytes)")
    return len(resp.content)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    args = parse_args()
    base_url = args.base_url.rstrip("/")

    if args.token:
        token = args.token
    else:
        if not args.email or not args.password:
            fail("Provide either --token, or both --email and --password (or env PRIMUS_TEST_*).")
        token = login(base_url, args.email, args.password)

    headers = {"Authorization": f"Bearer {token}"}

    initial = get_profile(base_url, headers)

    png, mime = make_test_image()
    upload_resp = upload(base_url, headers, png, mime)
    new_url = upload_resp["profile_picture_url"]

    after_upload = get_profile(base_url, headers)
    if after_upload.get("profile_picture_url") != new_url:
        fail(f"Profile URL didn't update. Got {after_upload.get('profile_picture_url')!r}, expected {new_url!r}.")
    ok("DB persisted the new URL")

    fetch_image(new_url)

    if args.keep:
        ok("--keep set — leaving the picture in place. Done.")
        return

    delete(base_url, headers)

    final = get_profile(base_url, headers)
    if final.get("profile_picture_url"):
        fail(f"Profile picture still set after DELETE: {final.get('profile_picture_url')}")
    ok("DB cleared the URL after DELETE")

    print()
    ok("All checks passed. Profile picture system is live end-to-end.")


if __name__ == "__main__":
    main()
