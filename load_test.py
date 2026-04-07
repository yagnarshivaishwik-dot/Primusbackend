"""
Primus Load Test
================
Simulates N PCs and M client users hitting the backend concurrently with a
realistic mix of API calls (heartbeats, logins, logouts).

What it does:
  Setup phase (one-time, idempotent):
    1. Logs in as the Cafe 1 admin
    2. Fetches an active license_key from /api/license/
    3. Registers M client users (POST /api/auth/register)
    4. Registers N PCs (POST /api/clientpc/register) — saves their device_secret
    5. Persists state to load_test_state.json so re-runs are fast

  Load phase (concurrent):
    For LOAD_TEST_DURATION_SEC seconds, a thread pool fires a weighted mix:
      - 70% PC heartbeats (signed HMAC-SHA256)
      - 15% user logins
      - 15% user logouts
    Each request is timed and counted.

  Report:
    Total requests, success rate, RPS, latency stats (avg/p50/p95/p99/max),
    HTTP status code histogram, and a per-endpoint breakdown.

Usage:
    pip install requests
    bash run_load_test.sh        # automated runner with credentials in env

Tunables (env vars, all optional):
    LOAD_TEST_DURATION_SEC       default 60
    LOAD_TEST_CONCURRENCY        default 20
    LOAD_TEST_NUM_PCS            default 40
    LOAD_TEST_NUM_USERS          default 30
    LOAD_TEST_BASE_URL           default http://localhost:8000
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import random
import secrets
import statistics
import string
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

# ============================================================
# Config
# ============================================================

BASE_URL    = os.environ.get("LOAD_TEST_BASE_URL", "http://localhost:8000")
ADMIN_EMAIL = os.environ.get("CAFE1_EMAIL", "")
ADMIN_PASS  = os.environ.get("CAFE1_PASSWORD", "")

DURATION_SEC = int(os.environ.get("LOAD_TEST_DURATION_SEC", "60"))
CONCURRENCY  = int(os.environ.get("LOAD_TEST_CONCURRENCY", "20"))
NUM_PCS      = int(os.environ.get("LOAD_TEST_NUM_PCS", "40"))
NUM_USERS    = int(os.environ.get("LOAD_TEST_NUM_USERS", "30"))

# Action weights (must sum to 1.0)
ACTION_WEIGHTS = {
    "heartbeat": 0.50,
    "login":     0.25,
    "logout":    0.25,
}

# Generated test users use this prefix so they're easy to identify and never
# collide with real users.
USER_PREFIX  = "loadtest_user_"
USER_DOMAIN  = "example.com"    # must pass Pydantic EmailStr validation
USER_PASSWORD = "LoadTest123"   # 8+ chars, upper, lower, digit (validator-compliant)

PC_PREFIX = "LoadTest-PC-"
HW_PREFIX = "loadtest-hw-"

STATE_FILE = "load_test_state.json"
REQUEST_TIMEOUT = 10  # seconds per HTTP call
VERIFY_SSL = False

# ============================================================
# Pretty output
# ============================================================

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
GREY   = "\033[90m"
RESET  = "\033[0m"
BOLD   = "\033[1m"


def section(title: str):
    bar = "─" * 64
    print(f"\n{CYAN}{BOLD}{bar}\n  {title}\n{bar}{RESET}")


def info(msg: str):
    print(f"  {msg}")


def ok(msg: str):
    print(f"  {GREEN}✓{RESET} {msg}")


def warn(msg: str):
    print(f"  {YELLOW}⚠{RESET} {msg}")


def fail(msg: str):
    print(f"  {RED}✗{RESET} {msg}")


# ============================================================
# Helpers
# ============================================================

def _post(path: str, **kw) -> requests.Response:
    return requests.post(f"{BASE_URL}{path}", verify=VERIFY_SSL, timeout=REQUEST_TIMEOUT, **kw)


def _get(path: str, **kw) -> requests.Response:
    return requests.get(f"{BASE_URL}{path}", verify=VERIFY_SSL, timeout=REQUEST_TIMEOUT, **kw)


def admin_login() -> str:
    """Login as Cafe 1 admin, return access_token."""
    resp = _post("/api/auth/login", data={"username": ADMIN_EMAIL, "password": ADMIN_PASS})
    if resp.status_code != 200:
        raise RuntimeError(f"Admin login failed: HTTP {resp.status_code} — {resp.text[:200]}")
    return resp.json()["access_token"]


def fetch_license_key(admin_token: str) -> str:
    """Find an active license key for the admin's cafe."""
    resp = _get("/api/license/", headers={"Authorization": f"Bearer {admin_token}"})
    if resp.status_code != 200:
        raise RuntimeError(f"GET /api/license/ failed: HTTP {resp.status_code} — {resp.text[:200]}")
    licenses = resp.json()
    if not licenses:
        raise RuntimeError("No licenses found for this admin's cafe.")
    for lic in licenses:
        if lic.get("is_active", True):
            return lic["key"]
    return licenses[0]["key"]


def list_existing_pcs(admin_token: str) -> list[dict]:
    """Return all PCs visible to the admin (cafe-scoped)."""
    resp = _get("/api/clientpc/", headers={"Authorization": f"Bearer {admin_token}"})
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data if isinstance(data, list) else []


def delete_pc(admin_token: str, pc_id: int) -> tuple[bool, str]:
    """
    DELETE a single PC by id (admin role required).

    The endpoint does a manual cascade delete across system_events,
    remote_commands, sessions and hardware_stats, so it can be slow.
    Use a generous per-call timeout. Returns (ok, error_detail).
    """
    try:
        resp = requests.delete(
            f"{BASE_URL}/api/clientpc/{pc_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            verify=VERIFY_SSL,
            timeout=60,
        )
        if resp.status_code in (200, 204):
            return True, ""
        return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        return False, f"exception: {type(e).__name__}: {e}"


def register_user(email: str, password: str, name: str) -> tuple[bool, str]:
    """Register a single client user. Returns (ok, detail).

    Sent as form-encoded data because the endpoint's mixed
    `body: Model | None = None` + `Form(...)` signature doesn't
    parse JSON reliably.
    """
    resp = _post(
        "/api/auth/register",
        data={
            "name": name,
            "email": email,
            "password": password,
            "tos_accepted": "true",
        },
    )
    if resp.status_code == 200:
        return True, ""
    return False, f"HTTP {resp.status_code}: {resp.text[:200]}"


def verify_user_login(email: str, password: str) -> tuple[bool, str]:
    """Probe login to confirm the user actually exists and the password works."""
    resp = _post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code == 200:
        return True, ""
    return False, f"HTTP {resp.status_code}: {resp.text[:200]}"


def register_pc(license_key: str, name: str, hardware_fingerprint: str) -> tuple[Optional[dict], str]:
    """Register a single PC, return (response_dict, error_detail)."""
    resp = _post(
        "/api/clientpc/register",
        json={
            "name": name,
            "license_key": license_key,
            "hardware_fingerprint": hardware_fingerprint,
            "capabilities": {"loadtest": True, "cpu": "Sim", "ram": 16},
        },
    )
    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code}: {resp.text[:200]}"
    return resp.json(), ""


def sign_heartbeat(device_secret: str, license_key: str, body: bytes = b"") -> tuple[dict, bytes]:
    """Build the (headers, body) tuple for a signed heartbeat call.

    The X-License-Key header is required so the backend can resolve cafe_id
    for the per-cafe DB router (heartbeat carries no JWT).
    """
    timestamp = str(int(time.time()))
    message = timestamp.encode() + body
    signature = hmac.new(device_secret.encode(), message, hashlib.sha256).hexdigest()
    headers = {
        "X-Signature": signature,
        "X-Timestamp": timestamp,
        "X-License-Key": license_key,
        "Content-Type": "application/json",
    }
    return headers, body


def login_user(email: str, password: str) -> Optional[str]:
    """Return access_token or None on failure."""
    resp = _post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code == 200:
        return resp.json().get("access_token")
    return None


def logout_user(token: str) -> bool:
    resp = _post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    return resp.status_code == 200


# ============================================================
# Setup phase
# ============================================================

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def setup_phase() -> dict:
    """
    Idempotent setup. Reuses cached state from STATE_FILE if available so
    re-runs are fast and don't spam the server with re-registrations.
    """
    section("Setup · Login & Discover License")

    if not ADMIN_EMAIL or not ADMIN_PASS:
        fail("CAFE1_EMAIL / CAFE1_PASSWORD env vars are required for setup.")
        sys.exit(1)

    state = load_state()
    if state.get("base_url") != BASE_URL:
        # Different target — discard cached state
        state = {}

    # ── Admin token ─────────────────────────────────────────
    admin_token = admin_login()
    ok(f"Admin logged in ({ADMIN_EMAIL})")

    # ── Cleanup of stale loadtest PCs (only on a fresh run) ─
    fresh_run = os.environ.get("LOAD_TEST_FRESH", "0") == "1"
    if fresh_run:
        section("Setup · Cleanup stale LoadTest PCs")
        existing = list_existing_pcs(admin_token)
        loadtest_pcs = [p for p in existing if (p.get("name") or "").startswith(PC_PREFIX)]
        if loadtest_pcs:
            info(f"Found {len(loadtest_pcs)} stale LoadTest PC(s); deleting in parallel…")

            cleanup_done = {"deleted": 0, "failed": 0, "first_err": ""}
            cleanup_lock = threading.Lock()
            total_to_delete = len(loadtest_pcs)

            def _del(pc_id: int):
                ok_flag, err = delete_pc(admin_token, pc_id)
                with cleanup_lock:
                    if ok_flag:
                        cleanup_done["deleted"] += 1
                    else:
                        cleanup_done["failed"] += 1
                        if not cleanup_done["first_err"]:
                            cleanup_done["first_err"] = err
                    done = cleanup_done["deleted"] + cleanup_done["failed"]
                    if done % 10 == 0 or done == total_to_delete:
                        print(f"    {GREY}…{done}/{total_to_delete} processed{RESET}")

            # 10 concurrent deletes — keeps the cascade load on the server
            # manageable while finishing 100 PCs in well under a minute.
            with ThreadPoolExecutor(max_workers=10) as pool:
                list(pool.map(lambda p: _del(p["id"]), loadtest_pcs))

            ok(f"Deleted {cleanup_done['deleted']} stale PC(s)")
            if cleanup_done["failed"]:
                warn(f"{cleanup_done['failed']} PC(s) could not be deleted")
                if cleanup_done["first_err"]:
                    warn(f"First delete error: {cleanup_done['first_err']}")
                warn("Tip: bump max_pcs on the license, or delete via SQL:")
                warn("  DELETE FROM client_pcs WHERE name LIKE 'LoadTest-PC-%';")
        else:
            ok("No stale LoadTest PCs found")

    # ── License key ─────────────────────────────────────────
    license_key = state.get("license_key")
    if not license_key:
        license_key = fetch_license_key(admin_token)
        state["license_key"] = license_key
    ok(f"License key acquired: {license_key[:12]}…")

    # ── Users ───────────────────────────────────────────────
    section(f"Setup · Register {NUM_USERS} client users")
    users = state.get("users", [])
    if len(users) < NUM_USERS:
        new_count = 0
        first_reg_err: str = ""
        for i in range(len(users), NUM_USERS):
            email = f"{USER_PREFIX}{i:03d}@{USER_DOMAIN}"
            ok_reg, err = register_user(email, USER_PASSWORD, f"LoadTest User {i:03d}")
            if not ok_reg and not first_reg_err:
                first_reg_err = err
            users.append({"email": email, "password": USER_PASSWORD})
            new_count += 1
        state["users"] = users
        ok(f"Registered {new_count} new user(s); total {len(users)}")
        if first_reg_err:
            warn(f"First registration error: {first_reg_err}")

    # Verify users can actually log in (registration is silent on duplicates).
    section("Setup · Verify users can log in")
    verified: list[dict] = []
    failed_count = 0
    first_login_err: str = ""
    for u in users:
        ok_login, err = verify_user_login(u["email"], u["password"])
        if ok_login:
            verified.append(u)
        else:
            failed_count += 1
            if not first_login_err:
                first_login_err = err
    if failed_count == 0:
        ok(f"All {len(verified)} users can log in")
    else:
        warn(f"{failed_count} of {len(users)} users failed login probe")
        if first_login_err:
            warn(f"First failure: {first_login_err}")
        if not verified:
            fail("No users could log in — load phase will skip login/logout actions")
    state["users"] = verified
    users = verified

    # ── PCs ─────────────────────────────────────────────────
    section(f"Setup · Register {NUM_PCS} PCs")
    pcs = state.get("pcs", [])
    if len(pcs) < NUM_PCS:
        new_count = 0
        first_pc_err: str = ""
        fail_count = 0
        for i in range(len(pcs), NUM_PCS):
            name = f"{PC_PREFIX}{i:03d}"
            hw_fp = f"{HW_PREFIX}{i:03d}-{secrets.token_hex(4)}"
            pc, err = register_pc(license_key, name, hw_fp)
            if pc and pc.get("device_secret"):
                pcs.append({
                    "id": pc["id"],
                    "name": name,
                    "hardware_fingerprint": hw_fp,
                    "device_secret": pc["device_secret"],
                    "license_key": license_key,
                })
                new_count += 1
            else:
                fail_count += 1
                if not first_pc_err:
                    first_pc_err = err
        state["pcs"] = pcs
        ok(f"Registered {new_count} new PC(s); total {len(pcs)}")
        if fail_count:
            warn(f"{fail_count} PC(s) failed to register")
            if first_pc_err:
                warn(f"First error: {first_pc_err}")
            warn("Tip: bump max_pcs on the license to allow more registrations")
    else:
        ok(f"{len(pcs)} PCs already cached, skipping registration")
        # Backfill license_key for state files written by older script versions
        for p in pcs:
            p.setdefault("license_key", license_key)

    state["base_url"] = BASE_URL
    save_state(state)
    return state


# ============================================================
# Load phase
# ============================================================

@dataclass
class Stats:
    total: int = 0
    success: int = 0
    failure: int = 0
    by_endpoint: dict = field(default_factory=dict)
    latencies_ms: list = field(default_factory=list)
    status_codes: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, endpoint: str, latency_ms: float, status: int, ok_flag: bool, err: str = ""):
        with self.lock:
            self.total += 1
            if ok_flag:
                self.success += 1
            else:
                self.failure += 1
                if err and len(self.errors) < 20:
                    self.errors.append(f"{endpoint}: {err}")
            self.latencies_ms.append(latency_ms)
            self.status_codes[status] = self.status_codes.get(status, 0) + 1
            ep = self.by_endpoint.setdefault(
                endpoint,
                {"total": 0, "success": 0, "fail": 0, "lat_ms": []},
            )
            ep["total"] += 1
            if ok_flag:
                ep["success"] += 1
            else:
                ep["fail"] += 1
            ep["lat_ms"].append(latency_ms)


def _do_heartbeat(pc: dict, stats: Stats):
    headers, body = sign_heartbeat(pc["device_secret"], pc["license_key"])
    t0 = time.perf_counter()
    err = ""
    status = 0
    ok_flag = False
    try:
        resp = _post(f"/api/clientpc/heartbeat/{pc['id']}", headers=headers, data=body)
        status = resp.status_code
        ok_flag = (200 <= status < 300)
        if not ok_flag:
            err = resp.text[:120]
    except Exception as e:
        err = f"exception: {type(e).__name__}: {e}"
    latency = (time.perf_counter() - t0) * 1000
    stats.record("heartbeat", latency, status, ok_flag, err)


def _do_login(user: dict, stats: Stats, token_jar: dict, jar_lock: threading.Lock):
    t0 = time.perf_counter()
    err = ""
    status = 0
    ok_flag = False
    try:
        resp = _post("/api/auth/login", data={"username": user["email"], "password": user["password"]})
        status = resp.status_code
        ok_flag = (status == 200)
        if ok_flag:
            tok = resp.json().get("access_token")
            if tok:
                with jar_lock:
                    token_jar[user["email"]] = tok
        else:
            err = resp.text[:120]
    except Exception as e:
        err = f"exception: {type(e).__name__}: {e}"
    latency = (time.perf_counter() - t0) * 1000
    stats.record("login", latency, status, ok_flag, err)


def _do_logout(stats: Stats, token_jar: dict, jar_lock: threading.Lock):
    with jar_lock:
        if not token_jar:
            return
        email = random.choice(list(token_jar.keys()))
        token = token_jar.pop(email)

    t0 = time.perf_counter()
    err = ""
    status = 0
    ok_flag = False
    try:
        resp = _post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        status = resp.status_code
        ok_flag = (200 <= status < 300)
        if not ok_flag:
            err = resp.text[:120]
    except Exception as e:
        err = f"exception: {type(e).__name__}: {e}"
    latency = (time.perf_counter() - t0) * 1000
    stats.record("logout", latency, status, ok_flag, err)


def load_phase(state: dict):
    pcs = state["pcs"]
    users = state["users"]

    if not pcs and not users:
        fail("Setup produced neither PCs nor users — aborting load phase.")
        sys.exit(1)
    if not pcs:
        warn("No PCs available — heartbeat actions will be skipped")
    if not users:
        warn("No verified users — login/logout actions will be skipped")

    section(
        f"Load Phase · {NUM_PCS} PCs, {NUM_USERS} users, "
        f"{CONCURRENCY} workers, {DURATION_SEC}s"
    )
    info(
        f"Action mix: heartbeat={ACTION_WEIGHTS['heartbeat']*100:.0f}%, "
        f"login={ACTION_WEIGHTS['login']*100:.0f}%, "
        f"logout={ACTION_WEIGHTS['logout']*100:.0f}%"
    )
    print()

    stats = Stats()
    token_jar: dict[str, str] = {}
    jar_lock = threading.Lock()
    stop_at = time.time() + DURATION_SEC
    stop_flag = threading.Event()

    # Drop actions whose dependent fixtures are missing so workers don't
    # waste cycles on impossible work.
    enabled_actions = {
        k: v for k, v in ACTION_WEIGHTS.items()
        if (k != "heartbeat" or pcs) and (k not in ("login", "logout") or users)
    }
    if not enabled_actions:
        fail("No viable actions available — aborting load phase.")
        sys.exit(1)
    actions = list(enabled_actions.keys())
    weights = list(enabled_actions.values())

    def worker():
        while not stop_flag.is_set() and time.time() < stop_at:
            action = random.choices(actions, weights=weights, k=1)[0]
            try:
                if action == "heartbeat":
                    pc = random.choice(pcs)
                    _do_heartbeat(pc, stats)
                elif action == "login":
                    user = random.choice(users)
                    _do_login(user, stats, token_jar, jar_lock)
                elif action == "logout":
                    _do_logout(stats, token_jar, jar_lock)
            except Exception as e:
                stats.record(action, 0.0, 0, False, f"worker exception: {e}")

    # Live progress printer
    def progress():
        last_total = 0
        while not stop_flag.is_set() and time.time() < stop_at:
            time.sleep(2.0)
            with stats.lock:
                cur = stats.total
                fails = stats.failure
            delta = cur - last_total
            rps = delta / 2.0
            elapsed = DURATION_SEC - max(0, int(stop_at - time.time()))
            print(f"  {GREY}[{elapsed:>3}s]{RESET} requests={cur:<6} "
                  f"rps={rps:<6.1f} failures={fails}")
            last_total = cur

    progress_thread = threading.Thread(target=progress, daemon=True)
    progress_thread.start()

    start_t = time.time()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        futures = [pool.submit(worker) for _ in range(CONCURRENCY)]
        try:
            for f in as_completed(futures):
                _ = f.result()
        except KeyboardInterrupt:
            stop_flag.set()
            warn("Interrupted by user — finishing in-flight requests…")

    elapsed = time.time() - start_t
    stop_flag.set()
    return stats, elapsed


# ============================================================
# Report
# ============================================================

def _percentile(values: list, pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * pct
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def report(stats: Stats, elapsed: float):
    section("Results")
    if stats.total == 0:
        fail("No requests were sent.")
        return

    success_rate = stats.success / stats.total * 100
    rps = stats.total / elapsed if elapsed > 0 else 0
    lat = stats.latencies_ms

    print(f"  {BOLD}Total requests   :{RESET} {stats.total}")
    print(f"  {BOLD}Successful       :{RESET} {GREEN}{stats.success}{RESET} ({success_rate:.1f}%)")
    print(f"  {BOLD}Failed           :{RESET} {RED if stats.failure else GREY}{stats.failure}{RESET}")
    print(f"  {BOLD}Duration         :{RESET} {elapsed:.1f}s")
    print(f"  {BOLD}Throughput       :{RESET} {rps:.1f} req/s")

    print(f"\n  {BOLD}Latency (ms){RESET}")
    if lat:
        print(f"    avg : {statistics.mean(lat):>7.1f}")
        print(f"    p50 : {_percentile(lat, 0.50):>7.1f}")
        print(f"    p95 : {_percentile(lat, 0.95):>7.1f}")
        print(f"    p99 : {_percentile(lat, 0.99):>7.1f}")
        print(f"    max : {max(lat):>7.1f}")

    print(f"\n  {BOLD}HTTP status codes{RESET}")
    for code in sorted(stats.status_codes.keys()):
        count = stats.status_codes[code]
        colour = GREEN if 200 <= code < 300 else (YELLOW if code == 429 else RED)
        label = "ok" if 200 <= code < 300 else ("rate-limited" if code == 429 else "error")
        print(f"    {colour}{code}{RESET}  {count:>6}  {GREY}{label}{RESET}")

    print(f"\n  {BOLD}Per-endpoint{RESET}")
    print(f"    {'endpoint':<12} {'total':>7} {'ok':>7} {'fail':>6} "
          f"{'avg(ms)':>9} {'p95(ms)':>9}")
    for ep, d in sorted(stats.by_endpoint.items()):
        avg_ms = statistics.mean(d["lat_ms"]) if d["lat_ms"] else 0
        p95_ms = _percentile(d["lat_ms"], 0.95) if d["lat_ms"] else 0
        print(f"    {ep:<12} {d['total']:>7} {GREEN}{d['success']:>7}{RESET} "
              f"{(RED if d['fail'] else GREY)}{d['fail']:>6}{RESET} "
              f"{avg_ms:>9.1f} {p95_ms:>9.1f}")

    if stats.errors:
        print(f"\n  {BOLD}Sample errors (first 20){RESET}")
        for e in stats.errors[:20]:
            print(f"    {RED}•{RESET} {e}")

    print()
    if success_rate >= 99:
        print(f"  {GREEN}{BOLD}PASS{RESET} — server handled the load with {success_rate:.1f}% success rate")
    elif success_rate >= 95:
        print(f"  {YELLOW}{BOLD}MARGINAL{RESET} — {success_rate:.1f}% success; investigate failures above")
    else:
        print(f"  {RED}{BOLD}FAIL{RESET} — only {success_rate:.1f}% success; server is struggling")
    print()


# ============================================================
# Main
# ============================================================

def main():
    print(f"\n{BOLD}Primus Load Test{RESET}")
    print(f"Target: {CYAN}{BASE_URL}{RESET}")
    print(f"Plan:   {NUM_PCS} PCs · {NUM_USERS} users · "
          f"{CONCURRENCY} workers · {DURATION_SEC}s\n")

    state = setup_phase()
    stats, elapsed = load_phase(state)
    report(stats, elapsed)


if __name__ == "__main__":
    main()
