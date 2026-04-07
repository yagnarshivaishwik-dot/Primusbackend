"""
Universal Login & Data Isolation Test Script
=============================================
Tests that:
  1. The same user can log into multiple cafes and each token carries the correct cafe_id
  2. Session data returned per cafe is completely separate (no cross-cafe leakage)
  3. User profile (email) is consistent regardless of which cafe is active

Usage:
  pip install requests
  python test_universal_login.py

Edit the CONFIG section below to match your environment before running.
"""

import base64
import json
import os
import sys
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

# ============================================================
# CONFIG — edit this section to match your environment
# ============================================================

BASE_URL = os.environ.get("PRIMUS_BASE_URL", "http://localhost:8000")

# Credentials are read from environment variables — never hardcoded.
#
# Set these before running:
#
#   export CAFE1_EMAIL="yagnarshivaishwik@gmail.com"
#   export CAFE1_PASSWORD="..."
#   export CAFE2_EMAIL="cristianomessi00110@gmail.com"
#   export CAFE2_PASSWORD="..."
#   export CLIENT_EMAIL="vaishwik"
#   export CLIENT_PASSWORD="..."
#
# On Windows (cmd):
#   set CAFE1_EMAIL=yagnarshivaishwik@gmail.com
#   set CAFE1_PASSWORD=...
#   (etc.)
#
# expected_cafe_id is None — the script will discover and print the actual
# cafe IDs on the first run. Fill them in afterwards for strict assertions.
CAFE_LOGINS = [
    {
        "cafe_name": "Cafe 1 (yagnarshivaishwik)",
        "expected_cafe_id": None,
        "email": os.environ.get("CAFE1_EMAIL", ""),
        "password": os.environ.get("CAFE1_PASSWORD", ""),
        "device_id": os.environ.get("CAFE1_DEVICE_ID") or None,
    },
    {
        "cafe_name": "Cafe 2 (cristianomessi)",
        "expected_cafe_id": None,
        "email": os.environ.get("CAFE2_EMAIL", ""),
        "password": os.environ.get("CAFE2_PASSWORD", ""),
        "device_id": os.environ.get("CAFE2_DEVICE_ID") or None,
    },
]

# Client user — tested in Phase 5 for concurrent session guard behaviour.
CLIENT_USER = {
    "email": os.environ.get("CLIENT_EMAIL", ""),
    "password": os.environ.get("CLIENT_PASSWORD", ""),
}

# Set to True to disable SSL certificate verification (useful for local dev)
VERIFY_SSL = False

# ============================================================
# Helpers
# ============================================================

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

_pass_count = 0
_fail_count = 0
_skip_count = 0


def _pass(label: str, detail: str = ""):
    global _pass_count
    _pass_count += 1
    suffix = f"  ({detail})" if detail else ""
    print(f"  {GREEN}[PASS]{RESET} {label}{suffix}")


def _fail(label: str, detail: str = ""):
    global _fail_count
    _fail_count += 1
    suffix = f"\n         {detail}" if detail else ""
    print(f"  {RED}[FAIL]{RESET} {label}{suffix}")


def _skip(label: str, reason: str = ""):
    global _skip_count
    _skip_count += 1
    suffix = f"  ({reason})" if reason else ""
    print(f"  {YELLOW}[SKIP]{RESET} {label}{suffix}")


def _section(title: str):
    bar = "─" * 60
    print(f"\n{CYAN}{BOLD}{bar}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{CYAN}{BOLD}{bar}{RESET}")


def decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without verifying signature."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload_b64 = parts[1]
        # Pad to a multiple of 4
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        decoded = base64.urlsafe_b64decode(payload_b64)
        return json.loads(decoded)
    except Exception:
        return {}


def login(email: str, password: str, device_id: Optional[str] = None) -> dict:
    """
    POST /api/auth/login with form data.
    Returns the full JSON response dict on HTTP 200.
    Raises RuntimeError with detail on any other status.
    """
    data = {"username": email, "password": password}
    if device_id:
        data["device_id"] = device_id

    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=data,
        verify=VERIFY_SSL,
        timeout=15,
    )

    if resp.status_code == 200:
        return resp.json()
    elif resp.status_code == 409:
        body = resp.json()
        detail = body.get("detail", {})
        if isinstance(detail, dict):
            raise RuntimeError(
                f"409 Concurrent session conflict — {detail.get('message', detail)}"
            )
        raise RuntimeError(f"409 {detail}")
    else:
        try:
            body = resp.json()
            detail = body.get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise RuntimeError(f"HTTP {resp.status_code}: {detail}")


def get_auth_me(token: str, cafe_id: Optional[int] = None) -> dict:
    """GET /api/auth/me with a Bearer token."""
    headers = {"Authorization": f"Bearer {token}"}
    if cafe_id is not None:
        headers["X-Cafe-Id"] = str(cafe_id)
    resp = requests.get(
        f"{BASE_URL}/api/auth/me",
        headers=headers,
        verify=VERIFY_SSL,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_session_history(token: str, cafe_id_header: Optional[int] = None) -> list:
    """GET /api/session/history with a Bearer token."""
    headers = {"Authorization": f"Bearer {token}"}
    if cafe_id_header is not None:
        headers["X-Cafe-Id"] = str(cafe_id_header)
    resp = requests.get(
        f"{BASE_URL}/api/session/history",
        headers=headers,
        verify=VERIFY_SSL,
        timeout=15,
    )
    if resp.status_code in (401, 403):
        return []
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


# ============================================================
# Test runner
# ============================================================

def run_tests():
    print(f"\n{BOLD}Primus Universal Login & Data Isolation Tests{RESET}")
    print(f"Target: {CYAN}{BASE_URL}{RESET}\n")

    if len(CAFE_LOGINS) < 1:
        print(f"{RED}ERROR: CAFE_LOGINS is empty. Edit the CONFIG section and re-run.{RESET}")
        sys.exit(1)

    # --------------------------------------------------------
    # Phase 1 — Login each cafe entry
    # --------------------------------------------------------
    _section("Phase 1 · Login & Token Validation")

    sessions = []  # list of dicts: {cafe_name, token, cafe_id_from_token, config}

    for cfg in CAFE_LOGINS:
        name = cfg["cafe_name"]
        print(f"\n  {BOLD}{name}{RESET}")

        # Test 1a — login succeeds
        try:
            result = login(cfg["email"], cfg["password"], cfg.get("device_id"))
        except RuntimeError as exc:
            _fail(f"{name} — login request", str(exc))
            sessions.append(None)
            continue

        token = result.get("access_token")
        if not token:
            _fail(f"{name} — access_token present in response",
                  f"Response keys: {list(result.keys())}")
            sessions.append(None)
            continue

        server_cafe_id = result.get("cafe_id")
        role = result.get("role", "unknown")
        _pass(f"{name} — login succeeded",
              f"cafe_id={server_cafe_id}, role={role}")

        # Test 1b — JWT payload contains cafe_id
        payload = decode_jwt_payload(token)
        jwt_cafe_id = payload.get("cafe_id")
        if jwt_cafe_id is None:
            _fail(f"{name} — JWT contains cafe_id claim",
                  f"JWT payload keys: {list(payload.keys())}")
        else:
            _pass(f"{name} — JWT contains cafe_id claim", f"cafe_id={jwt_cafe_id}")

        # Test 1c — JWT cafe_id matches expected (if configured)
        expected = cfg.get("expected_cafe_id")
        if expected is not None:
            if jwt_cafe_id == expected:
                _pass(f"{name} — JWT cafe_id matches expected ({expected})")
            else:
                _fail(f"{name} — JWT cafe_id matches expected",
                      f"expected={expected}, got={jwt_cafe_id}")
        else:
            _skip(f"{name} — expected_cafe_id not set in config")

        # Test 1d — server response cafe_id matches JWT claim
        if server_cafe_id is not None and jwt_cafe_id is not None:
            if server_cafe_id == jwt_cafe_id:
                _pass(f"{name} — response cafe_id matches JWT claim")
            else:
                _fail(f"{name} — response cafe_id matches JWT claim",
                      f"response={server_cafe_id}, JWT={jwt_cafe_id}")

        sessions.append({
            "cafe_name": name,
            "token": token,
            "cafe_id": jwt_cafe_id or server_cafe_id,
            "config": cfg,
        })

    # Filter out failed logins
    valid_sessions = [s for s in sessions if s is not None]

    if not valid_sessions:
        print(f"\n{RED}No valid sessions obtained — cannot continue to Phase 2/3.{RESET}")
        _print_summary()
        sys.exit(1)

    # --------------------------------------------------------
    # Phase 2 — Profile consistency
    # --------------------------------------------------------
    _section("Phase 2 · User Profile Consistency")
    print()

    emails_seen = {}
    for s in valid_sessions:
        try:
            me = get_auth_me(s["token"])
        except Exception as exc:
            _fail(f"{s['cafe_name']} — GET /api/auth/me", str(exc))
            continue

        email = me.get("email") or me.get("username")
        if email:
            emails_seen[s["cafe_name"]] = email
            _pass(f"{s['cafe_name']} — /api/auth/me returned email", email)
        else:
            _fail(f"{s['cafe_name']} — /api/auth/me returned email",
                  f"Response keys: {list(me.keys())}")

    if len(emails_seen) >= 2:
        all_emails = list(emails_seen.values())
        if len(set(all_emails)) == 1:
            _pass("Profile consistency — same email across all cafes", all_emails[0])
        else:
            # Different emails might be intentional (separate accounts), just report
            _skip("Profile consistency — different emails per cafe (separate accounts)",
                  str(emails_seen))

    # --------------------------------------------------------
    # Phase 3 — Session data isolation
    # --------------------------------------------------------
    _section("Phase 3 · Session Data Isolation")
    print()

    session_ids_by_cafe: dict[str, set] = {}

    for s in valid_sessions:
        try:
            history = get_session_history(s["token"])
        except Exception as exc:
            _fail(f"{s['cafe_name']} — GET /api/session/history", str(exc))
            continue

        ids = {entry.get("id") for entry in history if entry.get("id") is not None}
        session_ids_by_cafe[s["cafe_name"]] = ids
        _pass(f"{s['cafe_name']} — session history fetched",
              f"{len(ids)} session(s) returned")

    if len(session_ids_by_cafe) >= 2:
        names = list(session_ids_by_cafe.keys())
        total_overlap = 0
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = names[i], names[j]
                overlap = session_ids_by_cafe[a] & session_ids_by_cafe[b]
                if overlap:
                    _fail(
                        f"Session isolation — {a} vs {b}",
                        f"{len(overlap)} overlapping session ID(s): {overlap}"
                    )
                    total_overlap += len(overlap)
                elif not session_ids_by_cafe[a] and not session_ids_by_cafe[b]:
                    _skip(
                        f"Session isolation — {a} vs {b}",
                        "both cafes have 0 sessions; isolation cannot be verified"
                    )
                else:
                    _pass(
                        f"Session isolation — {a} vs {b}",
                        f"0 overlapping IDs ({len(session_ids_by_cafe[a])} vs "
                        f"{len(session_ids_by_cafe[b])} sessions)"
                    )

    # --------------------------------------------------------
    # Phase 4 — Cross-cafe header injection test
    # --------------------------------------------------------
    if len(valid_sessions) >= 2:
        _section("Phase 4 · Cross-Cafe Header Injection")
        print()

        s_a = valid_sessions[0]
        s_b = valid_sessions[1]

        cafe_b_id = s_b.get("cafe_id")
        if cafe_b_id is None:
            _skip("Header injection test", "Cafe B has no resolved cafe_id")
        else:
            # Use Token A but inject Cafe B's ID via X-Cafe-Id header
            try:
                injected_history = get_session_history(s_a["token"], cafe_id_header=cafe_b_id)
            except Exception as exc:
                _fail("Header injection — request did not error", str(exc))
                injected_history = None

            if injected_history is not None:
                injected_ids = {e.get("id") for e in injected_history if e.get("id")}
                ids_a = session_ids_by_cafe.get(s_a["cafe_name"], set())
                ids_b = session_ids_by_cafe.get(s_b["cafe_name"], set())

                if injected_ids and injected_ids <= ids_b and not (injected_ids & ids_a):
                    _fail(
                        f"Header injection — Token A with X-Cafe-Id={cafe_b_id} returns Cafe B data",
                        f"Returned {len(injected_ids)} Cafe B session IDs. "
                        "JWT cafe_id should take precedence over the header for non-superadmin users."
                    )
                else:
                    _pass(
                        f"Header injection — JWT cafe_id takes precedence over X-Cafe-Id header",
                        f"X-Cafe-Id={cafe_b_id} did not expose Cafe B's data to Token A"
                    )

    # --------------------------------------------------------
    # Phase 5 — Client concurrent session guard
    # --------------------------------------------------------
    _section("Phase 5 · Client Concurrent Session Guard")
    print()

    cafe_ids = [s["cafe_id"] for s in valid_sessions if s.get("cafe_id") is not None]
    if len(cafe_ids) < 2:
        _skip("Concurrent session guard", "need at least 2 cafes with resolved cafe_id")
    elif not CLIENT_USER.get("email") or not CLIENT_USER.get("password"):
        _skip("Concurrent session guard", "CLIENT_USER not configured")
    else:
        c_email = CLIENT_USER["email"]
        c_pass  = CLIENT_USER["password"]

        # Log in at first cafe
        try:
            r1 = login(c_email, c_pass)
            token1 = r1.get("access_token")
            cafe1  = r1.get("cafe_id")
            _pass(f"Client login — first cafe (cafe_id={cafe1})")
        except RuntimeError as exc:
            _fail("Client login — first cafe", str(exc))
            token1 = None

        if token1:
            # Attempt second login at a DIFFERENT cafe (without logging out first)
            # The backend should respond 409 if the client is already active elsewhere.
            other_cafe_session = next(
                (s for s in valid_sessions if s.get("cafe_id") != cafe1), None
            )
            if other_cafe_session is None:
                _skip("Concurrent guard — second-cafe login", "no other cafe to test against")
            else:
                # Use the second admin's device_id (if set) so the login resolves
                # to the other cafe; otherwise let the user's default cafe_id win.
                device_id_b = other_cafe_session["config"].get("device_id")
                try:
                    r2 = login(c_email, c_pass, device_id=device_id_b)
                    cafe2 = r2.get("cafe_id")
                    if cafe2 != cafe1:
                        _fail(
                            "Concurrent guard — second login blocked",
                            f"Expected HTTP 409 but login succeeded at cafe_id={cafe2}. "
                            "The client user may have a role other than 'client', "
                            "or device_id routing assigned them to the same cafe."
                        )
                    else:
                        _skip(
                            "Concurrent guard — same cafe resolved",
                            "Both logins landed on the same cafe_id; set device_id in CLIENT_USER to force a different cafe"
                        )
                except RuntimeError as exc:
                    if "409" in str(exc) or "already_logged_in" in str(exc) or "already logged in" in str(exc).lower():
                        _pass("Concurrent guard — second login correctly blocked (409)", str(exc))
                    else:
                        _fail("Concurrent guard — unexpected error on second login", str(exc))

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------
    _print_summary()


def _print_summary():
    bar = "=" * 60
    print(f"\n{BOLD}{bar}{RESET}")
    total = _pass_count + _fail_count + _skip_count
    print(
        f"{BOLD}  Results: "
        f"{GREEN}{_pass_count} passed{RESET}  "
        f"{RED}{_fail_count} failed{RESET}  "
        f"{YELLOW}{_skip_count} skipped{RESET}  "
        f"(of {total} checks)"
    )
    print(f"{BOLD}{bar}{RESET}\n")

    if _fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    run_tests()
