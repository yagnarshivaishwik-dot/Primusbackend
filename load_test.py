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
import functools
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

# Force every print() in this module to flush so progress lines show
# up immediately under nohup, SSH multiplexers, and any non-TTY stdout.
print = functools.partial(print, flush=True)

try:
    import requests
except ImportError:
    print("ERROR: 'requests' is not installed. Run: pip install requests")
    sys.exit(1)

# ============================================================
# Config
# ============================================================

BASE_URL = os.environ.get("LOAD_TEST_BASE_URL", "http://localhost:8000")

# Discover all configured cafes from env vars CAFE1_EMAIL/CAFE1_PASSWORD
# through CAFE9_EMAIL/CAFE9_PASSWORD. Skips any slot with empty creds.
def _discover_cafes() -> list[dict]:
    out = []
    for i in range(1, 10):
        email = os.environ.get(f"CAFE{i}_EMAIL", "").strip()
        pw    = os.environ.get(f"CAFE{i}_PASSWORD", "").strip()
        if email and pw:
            out.append({
                "label":    f"cafe{i}",
                "email":    email,
                "password": pw,
            })
    return out

CAFES = _discover_cafes()

DURATION_SEC        = int(os.environ.get("LOAD_TEST_DURATION_SEC", "60"))
CONCURRENCY         = int(os.environ.get("LOAD_TEST_CONCURRENCY", "20"))
# Per-cafe counts. Total PCs = NUM_PCS_PER_CAFE * len(CAFES).
NUM_PCS_PER_CAFE    = int(os.environ.get("LOAD_TEST_NUM_PCS_PER_CAFE", "100"))
NUM_USERS_PER_CAFE  = int(os.environ.get("LOAD_TEST_NUM_USERS_PER_CAFE", "100"))

# Legacy single-value knobs still honored if set explicitly. They become
# per-cafe overrides when NUM_*_PER_CAFE is at the default.
if "LOAD_TEST_NUM_PCS" in os.environ and "LOAD_TEST_NUM_PCS_PER_CAFE" not in os.environ:
    NUM_PCS_PER_CAFE = int(os.environ["LOAD_TEST_NUM_PCS"])
if "LOAD_TEST_NUM_USERS" in os.environ and "LOAD_TEST_NUM_USERS_PER_CAFE" not in os.environ:
    NUM_USERS_PER_CAFE = int(os.environ["LOAD_TEST_NUM_USERS"])
# When set, paces total RPS across all workers to stay under the
# server's rate limit. Use 10 if RATE_LIMIT_PER_MINUTE=1000 (default).
# When > 0, the setup phase also paces itself with sleep(1/TARGET_RPS)
# between requests so the cumulative budget isn't blown before the
# load phase starts.
TARGET_RPS   = float(os.environ.get("LOAD_TEST_TARGET_RPS", "0"))
SETUP_INTERVAL = (1.0 / TARGET_RPS) if TARGET_RPS > 0 else 0.0

# Action weights (must sum to 1.0). Default mix is heavily weighted
# toward heartbeats because logins serialize through Argon2 (CPU-bound
# server side) and would cap the achievable RPS. Override via env vars
# if you want more login pressure.
ACTION_WEIGHTS = {
    "heartbeat": float(os.environ.get("LOAD_TEST_W_HEARTBEAT", "0.95")),
    "login":     float(os.environ.get("LOAD_TEST_W_LOGIN",     "0.03")),
    "logout":    float(os.environ.get("LOAD_TEST_W_LOGOUT",    "0.02")),
}

# Generated test users use this prefix so they're easy to identify and never
# collide with real users.
USER_PREFIX  = "loadtest_user_"
USER_DOMAIN  = "example.com"    # must pass Pydantic EmailStr validation
USER_PASSWORD = "LoadTest123"   # 8+ chars, upper, lower, digit (validator-compliant)

PC_PREFIX = "LoadTest-PC-"
HW_PREFIX = "loadtest-hw-"

STATE_FILE = "load_test_state.json"
REQUEST_TIMEOUT = 30  # seconds per HTTP call (Argon2 + DB pool can be slow)
VERIFY_SSL = False

# ============================================================
# Pretty output
# ============================================================
# ANSI colors are auto-disabled when stdout is not a TTY (piped,
# captured by nohup, viewed through some SSH/tmux configurations,
# etc.) to keep the layout clean. Force on/off with the env vars
# NO_COLOR=1 or LOAD_TEST_COLOR=1.

def _use_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if os.environ.get("LOAD_TEST_COLOR") == "1":
        return True
    if os.environ.get("LOAD_TEST_COLOR") == "0":
        return False
    return sys.stdout.isatty()

if _use_color():
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    GREY   = "\033[90m"
    RESET  = "\033[0m"
    BOLD   = "\033[1m"
else:
    GREEN = RED = YELLOW = CYAN = GREY = RESET = BOLD = ""


def _print(msg: str = ""):
    """Print + flush so the line shows up immediately even when
    stdout is buffered (nohup, SSH multiplexers, etc.)."""
    print(msg, flush=True)


def section(title: str):
    # Plain ASCII bar so it renders cleanly in any terminal/pager.
    bar = "-" * 64
    print(f"\n{CYAN}{BOLD}{bar}{RESET}")
    print(f"{CYAN}{BOLD}  {title}{RESET}")
    print(f"{CYAN}{BOLD}{bar}{RESET}")


def info(msg: str):
    print(f"  {msg}")


def ok(msg: str):
    print(f"  {GREEN}[OK]{RESET}   {msg}")


def warn(msg: str):
    print(f"  {YELLOW}[WARN]{RESET} {msg}")


def fail(msg: str):
    print(f"  {RED}[FAIL]{RESET} {msg}")


# ============================================================
# Helpers
# ============================================================

# Global requests Session with a large connection pool. Default urllib3
# pool is 10 connections per host, which becomes the hard ceiling on
# RPS once concurrency goes past that. We size the pool to fit the
# worker count plus a comfortable margin.
_session = requests.Session()
_pool_size = max(int(os.environ.get("LOAD_TEST_CONCURRENCY", "30")) * 2, 100)
_adapter = requests.adapters.HTTPAdapter(
    pool_connections=_pool_size,
    pool_maxsize=_pool_size,
    max_retries=0,
)
_session.mount("http://",  _adapter)
_session.mount("https://", _adapter)


def _post(path: str, **kw) -> requests.Response:
    return _session.post(f"{BASE_URL}{path}", verify=VERIFY_SSL, timeout=REQUEST_TIMEOUT, **kw)


def _get(path: str, **kw) -> requests.Response:
    return _session.get(f"{BASE_URL}{path}", verify=VERIFY_SSL, timeout=REQUEST_TIMEOUT, **kw)


def admin_login(email: str, password: str) -> str:
    """Login as a cafe admin, return access_token."""
    resp = _post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code != 200:
        raise RuntimeError(f"Admin login failed for {email}: HTTP {resp.status_code} — {resp.text[:200]}")
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
        resp = _session.delete(
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


def _cleanup_stale_pcs(admin_token: str, label: str) -> None:
    """Delete any stale LoadTest-PC-* records visible to this cafe admin."""
    existing = list_existing_pcs(admin_token)
    loadtest_pcs = [p for p in existing if (p.get("name") or "").startswith(PC_PREFIX)]
    if not loadtest_pcs:
        ok(f"[{label}] No stale LoadTest PCs found")
        return

    info(f"[{label}] Found {len(loadtest_pcs)} stale LoadTest PC(s); deleting…")
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

    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(lambda p: _del(p["id"]), loadtest_pcs))

    ok(f"[{label}] Deleted {cleanup_done['deleted']} stale PC(s)")
    if cleanup_done["failed"]:
        warn(f"[{label}] {cleanup_done['failed']} PC(s) could not be deleted")
        if cleanup_done["first_err"]:
            warn(f"[{label}] First delete error: {cleanup_done['first_err']}")


def _setup_one_cafe(cafe: dict, cached: dict, fresh_run: bool) -> dict:
    """Setup one cafe: login, get license, cleanup, register PCs + users.

    Returns a dict with keys: label, license_key, pcs, users.
    Mutates `cached` to reuse what's already there.
    """
    label = cafe["label"]
    section(f"Setup · {label} · {cafe['email']}")

    # ── Admin token ─────────────────────────────────────────
    admin_token = admin_login(cafe["email"], cafe["password"])
    ok(f"Admin logged in")

    # ── Stale PC cleanup ─────────────────────────────────────
    if fresh_run:
        _cleanup_stale_pcs(admin_token, label)

    # ── License key ─────────────────────────────────────────
    license_key = cached.get("license_key")
    if not license_key:
        license_key = fetch_license_key(admin_token)
    ok(f"License key: {license_key[:12]}…")

    # ── Users (per cafe) ────────────────────────────────────
    users = cached.get("users", [])
    if len(users) < NUM_USERS_PER_CAFE:
        new_count = 0
        first_reg_err = ""
        for i in range(len(users), NUM_USERS_PER_CAFE):
            email = f"{USER_PREFIX}{label}_{i:03d}@{USER_DOMAIN}"
            ok_reg, err = register_user(email, USER_PASSWORD,
                                        f"LoadTest {label} {i:03d}")
            if not ok_reg and not first_reg_err:
                first_reg_err = err
            users.append({"email": email, "password": USER_PASSWORD, "cafe": label})
            new_count += 1
            if SETUP_INTERVAL > 0:
                time.sleep(SETUP_INTERVAL)
        ok(f"Registered {new_count} new user(s); total {len(users)}")
        if first_reg_err:
            warn(f"First registration error: {first_reg_err}")

    # Verify users can log in
    verified: list[dict] = []
    failed_count = 0
    first_login_err = ""
    for u in users:
        ok_login, err = verify_user_login(u["email"], u["password"])
        if ok_login:
            verified.append(u)
        else:
            failed_count += 1
            if not first_login_err:
                first_login_err = err
        if SETUP_INTERVAL > 0:
            time.sleep(SETUP_INTERVAL)
    if failed_count == 0:
        ok(f"All {len(verified)} users can log in")
    else:
        warn(f"{failed_count} of {len(users)} users failed login probe")
        if first_login_err:
            warn(f"First failure: {first_login_err}")
    users = verified

    # ── PCs (per cafe) ──────────────────────────────────────
    pcs = cached.get("pcs", [])
    if len(pcs) < NUM_PCS_PER_CAFE:
        new_count = 0
        first_pc_err = ""
        fail_count = 0
        for i in range(len(pcs), NUM_PCS_PER_CAFE):
            name = f"{PC_PREFIX}{label}-{i:03d}"
            hw_fp = f"{HW_PREFIX}{label}-{i:03d}-{secrets.token_hex(4)}"
            pc, err = register_pc(license_key, name, hw_fp)
            if pc and pc.get("device_secret"):
                pcs.append({
                    "id": pc["id"],
                    "name": name,
                    "hardware_fingerprint": hw_fp,
                    "device_secret": pc["device_secret"],
                    "license_key": license_key,
                    "cafe": label,
                })
                new_count += 1
            else:
                fail_count += 1
                if not first_pc_err:
                    first_pc_err = err
            if SETUP_INTERVAL > 0:
                time.sleep(SETUP_INTERVAL)
        ok(f"Registered {new_count} new PC(s); total {len(pcs)}")
        if fail_count:
            warn(f"{fail_count} PC(s) failed to register")
            if first_pc_err:
                warn(f"First error: {first_pc_err}")
            warn("Tip: bump max_pcs on the license to allow more registrations")
    else:
        ok(f"{len(pcs)} PCs already cached, skipping registration")
        for p in pcs:
            p.setdefault("license_key", license_key)
            p.setdefault("cafe", label)

    return {
        "label":       label,
        "license_key": license_key,
        "pcs":         pcs,
        "users":       users,
    }


def setup_phase() -> dict:
    """
    Idempotent multi-cafe setup. Iterates each configured cafe, logs in
    its admin, fetches its license, and registers per-cafe PCs and users.
    Reuses cached state from STATE_FILE so re-runs are fast.
    """
    if not CAFES:
        fail("No cafes configured. Set CAFE1_EMAIL/CAFE1_PASSWORD (and "
             "optionally CAFE2_*, CAFE3_*, ...) env vars.")
        sys.exit(1)

    section(f"Setup · {len(CAFES)} cafe(s) · "
            f"{NUM_PCS_PER_CAFE} PCs/cafe · {NUM_USERS_PER_CAFE} users/cafe")
    info(f"Total: {len(CAFES) * NUM_PCS_PER_CAFE} PCs, "
         f"{len(CAFES) * NUM_USERS_PER_CAFE} users")

    state = load_state()
    if state.get("base_url") != BASE_URL:
        # Different target — discard cached state
        state = {"cafes": {}}
    state.setdefault("cafes", {})

    fresh_run = os.environ.get("LOAD_TEST_FRESH", "0") == "1"

    for cafe in CAFES:
        cached = state["cafes"].get(cafe["label"], {})
        try:
            state["cafes"][cafe["label"]] = _setup_one_cafe(cafe, cached, fresh_run)
        except RuntimeError as e:
            fail(f"[{cafe['label']}] Setup failed: {e}")
            # Continue with other cafes; we'll just have less load.

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
    by_cafe:     dict = field(default_factory=dict)
    latencies_ms: list = field(default_factory=list)
    status_codes: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, endpoint: str, latency_ms: float, status: int,
               ok_flag: bool, err: str = "", cafe: str = "?"):
        with self.lock:
            self.total += 1
            if ok_flag:
                self.success += 1
            else:
                self.failure += 1
                if err and len(self.errors) < 20:
                    self.errors.append(f"[{cafe}] {endpoint}: {err}")
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
            cf = self.by_cafe.setdefault(
                cafe,
                {"total": 0, "success": 0, "fail": 0, "lat_ms": []},
            )
            cf["total"] += 1
            if ok_flag:
                cf["success"] += 1
            else:
                cf["fail"] += 1
            cf["lat_ms"].append(latency_ms)


def _do_heartbeat(pc: dict, stats: Stats):
    headers, body = sign_heartbeat(pc["device_secret"], pc["license_key"])
    cafe = pc.get("cafe", "?")
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
    stats.record("heartbeat", latency, status, ok_flag, err, cafe=cafe)


def _do_login(user: dict, stats: Stats, token_jar: dict, jar_lock: threading.Lock):
    cafe = user.get("cafe", "?")
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
                    token_jar[user["email"]] = (tok, cafe)
        else:
            err = resp.text[:120]
    except Exception as e:
        err = f"exception: {type(e).__name__}: {e}"
    latency = (time.perf_counter() - t0) * 1000
    stats.record("login", latency, status, ok_flag, err, cafe=cafe)


def _do_logout(stats: Stats, token_jar: dict, jar_lock: threading.Lock):
    with jar_lock:
        if not token_jar:
            return
        email = random.choice(list(token_jar.keys()))
        token, cafe = token_jar.pop(email)

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
    stats.record("logout", latency, status, ok_flag, err, cafe=cafe)


def load_phase(state: dict):
    # Flatten per-cafe pools into single PC and user lists. Each entry
    # already carries its "cafe" tag so per-cafe stats are easy.
    pcs: list = []
    users: list = []
    for cafe_label, cafe_state in state.get("cafes", {}).items():
        pcs.extend(cafe_state.get("pcs", []))
        users.extend(cafe_state.get("users", []))

    if not pcs and not users:
        fail("Setup produced neither PCs nor users — aborting load phase.")
        sys.exit(1)
    if not pcs:
        warn("No PCs available — heartbeat actions will be skipped")
    if not users:
        warn("No verified users — login/logout actions will be skipped")

    section(
        f"Load Phase · {len(pcs)} PCs, {len(users)} users "
        f"({len(state.get('cafes', {}))} cafes), "
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

    # Pre-warm the token jar with up to 50 logins (sampled across cafes)
    # so the load phase spends its budget on heartbeats rather than
    # waiting on Argon2. Done serially to avoid CPU saturation.
    if users:
        # Sample evenly across cafes for the warmup
        warm = min(50, len(users))
        sample = random.sample(users, warm) if len(users) > warm else users
        info(f"Pre-warming token jar with {warm} login(s)…")
        for u in sample:
            tok = login_user(u["email"], u["password"])
            if tok:
                token_jar[u["email"]] = (tok, u.get("cafe", "?"))
            if SETUP_INTERVAL > 0:
                time.sleep(SETUP_INTERVAL)
        ok(f"Token jar primed with {len(token_jar)} token(s)")
        print()
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

    # Token-bucket-style pacer. When TARGET_RPS > 0 we hand out at most
    # TARGET_RPS request tokens per second across all workers, so the
    # client never overruns the server's rate limiter.
    pacer_lock = threading.Lock()
    pacer_state = {"next_at": time.time()}
    interval = (1.0 / TARGET_RPS) if TARGET_RPS > 0 else 0.0

    def acquire_slot():
        if interval <= 0:
            return
        with pacer_lock:
            now = time.time()
            wait_until = max(now, pacer_state["next_at"])
            pacer_state["next_at"] = wait_until + interval
        sleep_for = wait_until - time.time()
        if sleep_for > 0:
            time.sleep(sleep_for)

    if TARGET_RPS > 0:
        info(f"Client pacer enabled: {TARGET_RPS:.1f} req/s ceiling")

    def worker():
        while not stop_flag.is_set() and time.time() < stop_at:
            acquire_slot()
            if stop_flag.is_set() or time.time() >= stop_at:
                break
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
            print(
                f"  [{elapsed:>3}s]  requests={cur:>6}  "
                f"rps={rps:>6.1f}  failures={fails:>5}"
            )
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

    print(f"  {BOLD}Total requests {RESET} : {stats.total}")
    print(f"  {BOLD}Successful     {RESET} : {GREEN}{stats.success}{RESET} ({success_rate:.1f}%)")
    print(f"  {BOLD}Failed         {RESET} : {RED if stats.failure else GREY}{stats.failure}{RESET}")
    print(f"  {BOLD}Duration       {RESET} : {elapsed:.1f}s")
    print(f"  {BOLD}Throughput     {RESET} : {rps:.1f} req/s")

    print()
    print(f"  {BOLD}Latency (ms){RESET}")
    if lat:
        print(f"    avg : {statistics.mean(lat):>8.1f}")
        print(f"    p50 : {_percentile(lat, 0.50):>8.1f}")
        print(f"    p95 : {_percentile(lat, 0.95):>8.1f}")
        print(f"    p99 : {_percentile(lat, 0.99):>8.1f}")
        print(f"    max : {max(lat):>8.1f}")

    print()
    print(f"  {BOLD}HTTP status codes{RESET}")
    for code in sorted(stats.status_codes.keys()):
        count = stats.status_codes[code]
        colour = GREEN if 200 <= code < 300 else (YELLOW if code == 429 else RED)
        label = "ok" if 200 <= code < 300 else ("rate-limited" if code == 429 else "error")
        print(f"    {colour}{code:>5}{RESET}  {count:>7}  {label}")

    print()
    print(f"  {BOLD}Per-endpoint{RESET}")
    print(f"    {'endpoint':<12}  {'total':>7}  {'ok':>7}  {'fail':>6}  "
          f"{'avg(ms)':>9}  {'p95(ms)':>9}")
    print(f"    {'-'*12}  {'-'*7}  {'-'*7}  {'-'*6}  {'-'*9}  {'-'*9}")
    for ep, d in sorted(stats.by_endpoint.items()):
        avg_ms = statistics.mean(d["lat_ms"]) if d["lat_ms"] else 0
        p95_ms = _percentile(d["lat_ms"], 0.95) if d["lat_ms"] else 0
        print(
            f"    {ep:<12}  {d['total']:>7}  "
            f"{GREEN}{d['success']:>7}{RESET}  "
            f"{(RED if d['fail'] else '')}{d['fail']:>6}{RESET}  "
            f"{avg_ms:>9.1f}  {p95_ms:>9.1f}"
        )

    if stats.by_cafe and len(stats.by_cafe) > 1:
        print()
        print(f"  {BOLD}Per-cafe{RESET}")
        print(f"    {'cafe':<12}  {'total':>7}  {'ok':>7}  {'fail':>6}  "
              f"{'avg(ms)':>9}  {'p95(ms)':>9}")
        print(f"    {'-'*12}  {'-'*7}  {'-'*7}  {'-'*6}  {'-'*9}  {'-'*9}")
        for cf, d in sorted(stats.by_cafe.items()):
            avg_ms = statistics.mean(d["lat_ms"]) if d["lat_ms"] else 0
            p95_ms = _percentile(d["lat_ms"], 0.95) if d["lat_ms"] else 0
            print(
                f"    {cf:<12}  {d['total']:>7}  "
                f"{GREEN}{d['success']:>7}{RESET}  "
                f"{(RED if d['fail'] else '')}{d['fail']:>6}{RESET}  "
                f"{avg_ms:>9.1f}  {p95_ms:>9.1f}"
            )

    if stats.errors:
        print()
        print(f"  {BOLD}Sample errors (first 20){RESET}")
        for e in stats.errors[:20]:
            print(f"    - {e}")

    # If most failures are 429, call it out — the operator probably forgot
    # to bump RATE_LIMIT_PER_MINUTE on the backend.
    rate_limited = stats.status_codes.get(429, 0)
    if rate_limited and rate_limited >= max(1, stats.failure * 0.5):
        print()
        print(f"  {YELLOW}{BOLD}NOTE{RESET}: {rate_limited} of {stats.failure} failures were "
              f"HTTP 429 (rate-limited).")
        print(f"  The server is NOT struggling — the rate limiter is throttling the test.")
        print(f"  Restart the backend with a higher cap, e.g.:")
        print(f"    {GREY}RATE_LIMIT_PER_MINUTE=1000000 RATE_LIMIT_BURST=10000 \\{RESET}")
        print(f"    {GREY}  uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4{RESET}")

    print()
    if success_rate >= 99:
        print(f"  {GREEN}{BOLD}PASS{RESET} — server handled the load with {success_rate:.1f}% success rate")
    elif success_rate >= 95:
        print(f"  {YELLOW}{BOLD}MARGINAL{RESET} — {success_rate:.1f}% success; investigate failures above")
    else:
        if rate_limited and rate_limited >= max(1, stats.failure * 0.5):
            print(f"  {YELLOW}{BOLD}BLOCKED{RESET} — only {success_rate:.1f}% success "
                  f"because of rate limiter (see note above)")
        else:
            print(f"  {RED}{BOLD}FAIL{RESET} — only {success_rate:.1f}% success; server is struggling")
    print()


# ============================================================
# Main
# ============================================================

def main():
    total_pcs   = len(CAFES) * NUM_PCS_PER_CAFE
    total_users = len(CAFES) * NUM_USERS_PER_CAFE
    print(f"\n{BOLD}Primus Load Test{RESET}")
    print(f"Target: {CYAN}{BASE_URL}{RESET}")
    print(f"Plan:   {len(CAFES)} cafes · {total_pcs} PCs · "
          f"{total_users} users · {CONCURRENCY} workers · {DURATION_SEC}s\n")

    state = setup_phase()
    stats, elapsed = load_phase(state)
    report(stats, elapsed)


if __name__ == "__main__":
    main()
