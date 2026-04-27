#!/usr/bin/env python3
"""
Import Primus Bug Fix Timeline (HTML) into Bugzilla via REST API.

Requirements (one-time):
    pip install requests beautifulsoup4

Usage:
    1. Log in to Bugzilla → Preferences → API Keys → Generate a new key.
    2. Run:
        python import_bugs.py \
            --html  /path/to/Primus_Bug_Fix_Timeline.html \
            --url   http://20.55.214.91:8081 \
            --key   YOUR_API_KEY \
            [--dry-run]

    Re-running is safe — bugs that already exist (by summary match) are skipped.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from typing import Optional

import requests
from bs4 import BeautifulSoup


# ── Mapping tables ───────────────────────────────────────────────────
SEVERITY_MAP = {
    "p0": "blocker",
    "p1": "critical",
    "p2": "major",
    "p3": "normal",
}

PRIORITY_MAP = {
    "p0": "Highest",
    "p1": "High",
    "p2": "Normal",
    "p3": "Low",
}

# Pill text ("P1 · Admin ops") → component name we want in Bugzilla.
# Keep the right-hand side small/canonical so we don't make 20 components.
COMPONENT_MAP = {
    "admin":          "Admin",
    "admin ops":      "Admin",
    "kiosk":          "Kiosk",
    "auth":           "Auth",
    "ux":             "UX",
    "multi-db sync":  "Backend",
    "data":           "Backend",
    "backend":        "Backend",
}

DEFAULT_COMPONENTS = ["Admin", "Kiosk", "Auth", "UX", "Backend", "Security", "General"]
PRODUCT_NAME = "Primus"
PRODUCT_VERSION = "v1.0.x"
PRODUCT_VERSIONS_TO_CREATE = ["v1.0.x", "v1.1.0"]


# ── Extra bugs not in the HTML timeline (operator notes / post-incident) ──
EXTRA_BUGS_RAW = [
    {
        "number": 13,
        "title": "SuperAdmin data wiped from DB; security rebuild required to regain admin access",
        "severity_key": "p0",
        "component": "Security",
        "description": (
            "SYMPTOM:\n"
            "The SuperAdmin-side data has been entirely wiped from the database. "
            "We are locked out of the admin site — the SuperAdmin security "
            "implementation is strong by design (no self-serve recovery), so "
            "there is no in-app path back in.\n\n"
            "IMPACT:\n"
            "- No one can log in as SuperAdmin.\n"
            "- All admin-only operations are blocked at the door (this gates "
            "  every fix in issues #1, #2, #3, #8, #9 — those cannot be "
            "  validated until SuperAdmin access is restored).\n\n"
            "ROOT CAUSE:\n"
            "Pending investigation. Either the table(s) backing SuperAdmin "
            "accounts / roles / sessions were dropped or truncated, or the "
            "rows specifically required for auth (users, role bindings, MFA "
            "secrets) were affected. Confirm via diff against the most recent "
            "backup before any further writes.\n\n"
            "PLAN:\n"
            "1. Snapshot the current DB state immediately (no more writes).\n"
            "2. Diff against the latest known-good backup; identify exactly "
            "   which tables/rows are missing.\n"
            "3. Decide: restore-from-backup vs. rebuild SuperAdmin auth from "
            "   scratch.\n"
            "4. If rebuilding: provision a fresh SuperAdmin via a server-side "
            "   bootstrap script (signed with a Vault key), with a one-time "
            "   token that expires in 15 minutes. Rotate JWT signing key + "
            "   Vault tokens immediately after.\n"
            "5. Enable point-in-time recovery and automated nightly DB "
            "   snapshots so this can't recur silently.\n\n"
            "ACCEPTANCE TEST:\n"
            "- A documented SuperAdmin login works end-to-end.\n"
            "- Audit log shows the recovery action and who performed it.\n"
            "- Backup/restore drill passes for both DB and Vault state.\n"
            "- Admin endpoints used in issues #1, #2, #3 are reachable again.\n\n"
            "OWNER / ETA:\n"
            "Backend + Security · TOP priority. Blocks all admin-domain fixes.\n\n"
            "— Imported from operator note (post-incident; not in original timeline HTML)."
        ),
    },
]


# ── Data model ───────────────────────────────────────────────────────
@dataclass
class ParsedBug:
    number: int
    title: str
    severity: str           # blocker / critical / major / normal
    priority: str           # Highest / High / Normal / Low
    component: str          # Admin / Kiosk / Auth / ...
    description: str        # multiline body composed from <dt>/<dd> pairs

    @property
    def summary(self) -> str:
        # Bugzilla's "summary" = single-line subject. Prefix with [Primus]
        # and the bug number so re-imports can dedupe.
        return f"[Primus #{self.number}] {self.title}"


# ── HTML parsing ─────────────────────────────────────────────────────
def parse_html(path: str) -> list[ParsedBug]:
    with open(path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    bugs: list[ParsedBug] = []
    for div in soup.select("div.issue"):
        # id="issue-N"
        num_match = re.search(r"\d+", div.get("id", ""))
        if not num_match:
            continue
        number = int(num_match.group())

        h3 = div.select_one(".issue-head h3")
        if not h3:
            continue
        # Strip "1. " prefix and any trailing tags like "<span class='tag new'>new</span>"
        title_raw = h3.get_text(" ", strip=True)
        title = re.sub(r"^\d+\.\s*", "", title_raw).replace(" new", "").strip()

        pill = div.select_one(".issue-head .pill")
        pill_class = " ".join(pill.get("class", [])) if pill else ""
        sev_match = re.search(r"\bp([0-3])\b", pill_class)
        sev_key = f"p{sev_match.group(1)}" if sev_match else "p2"
        severity = SEVERITY_MAP[sev_key]
        priority = PRIORITY_MAP[sev_key]

        # Component from pill text after "·"
        component = "General"
        if pill:
            pill_text = pill.get_text(" ", strip=True)
            if "·" in pill_text:
                tail = pill_text.split("·", 1)[1].strip().lower()
                component = COMPONENT_MAP.get(tail, "General")

        # Build description from each <dt>/<dd> pair
        body_lines: list[str] = []
        kv = div.select_one("dl.kv")
        if kv:
            current_label: Optional[str] = None
            for child in kv.find_all(["dt", "dd"], recursive=False):
                text = child.get_text(" ", strip=True)
                if child.name == "dt":
                    current_label = text.upper()
                else:
                    if current_label:
                        body_lines.append(current_label + ":")
                    body_lines.append(text)
                    body_lines.append("")  # blank line between sections
                    current_label = None
        description = "\n".join(body_lines).rstrip()
        description += "\n\n— Imported from Primus Bug Fix Timeline."

        bugs.append(ParsedBug(
            number=number,
            title=title,
            severity=severity,
            priority=priority,
            component=component,
            description=description,
        ))

    # Append manually-curated extras (operator notes, post-incident bugs).
    for raw in EXTRA_BUGS_RAW:
        sev_key = raw["severity_key"]
        bugs.append(ParsedBug(
            number=raw["number"],
            title=raw["title"],
            severity=SEVERITY_MAP[sev_key],
            priority=PRIORITY_MAP[sev_key],
            component=raw["component"],
            description=raw["description"],
        ))

    return bugs


# ── Bugzilla REST client ─────────────────────────────────────────────
class BZClient:
    def __init__(self, base_url: str, api_key: str, dry_run: bool = False):
        self.base = base_url.rstrip("/")
        self.dry = dry_run
        self.session = requests.Session()
        self.session.headers["X-BUGZILLA-API-KEY"] = api_key
        self.session.headers["Content-Type"] = "application/json"

    def _do(self, method: str, path: str, **kw) -> dict:
        url = f"{self.base}/rest{path}"
        if self.dry and method in ("POST", "PUT", "DELETE"):
            print(f"  [dry-run] {method} {path}")
            return {}
        r = self.session.request(method, url, timeout=30, **kw)
        try:
            r.raise_for_status()
        except requests.HTTPError as e:
            print(f"  ✗ {method} {path} → {r.status_code}", file=sys.stderr)
            print(f"    {r.text[:400]}", file=sys.stderr)
            raise e
        return r.json()

    # ---- product / component / version ----
    def get_product(self, name: str) -> Optional[dict]:
        data = self._do("GET", f"/product?names={name}")
        products = data.get("products") or []
        return products[0] if products else None

    def create_product(self, name: str, description: str = "") -> int:
        data = self._do("POST", "/product", json={
            "name": name,
            "description": description or f"{name} application",
            "version": PRODUCT_VERSIONS_TO_CREATE[0],
            "has_unconfirmed": True,
            "is_open": True,
        })
        pid = data.get("id", 0)
        print(f"  + product {name!r} id={pid}")
        return pid

    def ensure_component(self, product: str, component: str, default_assignee: str):
        try:
            self._do("POST", "/component", json={
                "product": product,
                "name": component,
                "description": f"{component} subsystem",
                "default_assignee": default_assignee,
            })
            print(f"  + component {component!r}")
        except requests.HTTPError as e:
            if e.response.status_code in (400, 409):
                # Already exists — that's fine.
                print(f"  · component {component!r} already exists")
            else:
                raise

    def ensure_version(self, product: str, version: str):
        try:
            self._do("POST", "/version", json={
                "product": product,
                "name": version,
            })
            print(f"  + version {version!r}")
        except requests.HTTPError as e:
            if e.response.status_code in (400, 409):
                print(f"  · version {version!r} already exists")
            else:
                raise

    # ---- bugs ----
    def find_bug_by_summary(self, summary: str) -> Optional[int]:
        # Bugzilla supports `summary` as a substring search; we use exact match
        # via `quicksearch="\"...\""`. Fallback to summary param.
        data = self._do("GET", "/bug", params={
            "summary": summary,
            "include_fields": "id,summary",
        })
        for b in data.get("bugs", []):
            if b.get("summary") == summary:
                return b["id"]
        return None

    def create_bug(self, *, product: str, component: str, summary: str,
                   description: str, severity: str, priority: str,
                   version: str) -> int:
        data = self._do("POST", "/bug", json={
            "product": product,
            "component": component,
            "summary": summary,
            "version": version,
            "op_sys": "All",
            "platform": "All",
            "severity": severity,
            "priority": priority,
            "description": description,
        })
        return data.get("id", 0)


# ── Orchestration ────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", required=True, help="Path to Primus_Bug_Fix_Timeline.html")
    ap.add_argument("--url",  required=True, help="Bugzilla base URL, e.g. http://20.55.214.91:8081")
    ap.add_argument("--key",  required=True, help="Bugzilla API key")
    ap.add_argument("--admin-email", default="",
                    help="Default assignee for new components (defaults to your API key's user)")
    ap.add_argument("--dry-run", action="store_true", help="Parse + plan, don't write")
    args = ap.parse_args()

    print(f"Parsing {args.html} …")
    bugs = parse_html(args.html)
    print(f"  found {len(bugs)} issues")
    for b in bugs:
        print(f"    #{b.number:2d}  [{b.severity:8s}]  {b.component:8s}  {b.title}")

    bz = BZClient(args.url, args.key, dry_run=args.dry_run)

    # Resolve default assignee
    if not args.admin_email:
        try:
            who = bz._do("GET", "/whoami")
            args.admin_email = who.get("name") or "admin@example.com"
        except Exception:
            args.admin_email = "admin@example.com"
    print(f"\nDefault assignee: {args.admin_email}")

    # Ensure product
    print(f"\nEnsuring product {PRODUCT_NAME!r} …")
    if bz.get_product(PRODUCT_NAME) is None:
        bz.create_product(PRODUCT_NAME, "Primus kiosk + admin + backend")
    else:
        print(f"  · product {PRODUCT_NAME!r} already exists")

    # Versions
    print("\nEnsuring versions …")
    for v in PRODUCT_VERSIONS_TO_CREATE:
        bz.ensure_version(PRODUCT_NAME, v)

    # Components — both the canonical set and any mentioned in the bugs
    needed_components = set(DEFAULT_COMPONENTS) | {b.component for b in bugs}
    print("\nEnsuring components …")
    for c in sorted(needed_components):
        bz.ensure_component(PRODUCT_NAME, c, args.admin_email)

    # File the bugs
    print("\nFiling bugs …")
    created = skipped = failed = 0
    for b in bugs:
        existing = bz.find_bug_by_summary(b.summary) if not args.dry_run else None
        if existing:
            print(f"  · #{b.number:2d} already exists as bug {existing}: {b.title}")
            skipped += 1
            continue
        try:
            bug_id = bz.create_bug(
                product=PRODUCT_NAME,
                component=b.component,
                summary=b.summary,
                description=b.description,
                severity=b.severity,
                priority=b.priority,
                version=PRODUCT_VERSION,
            )
            print(f"  + #{b.number:2d} → bug {bug_id}: {b.title}")
            created += 1
        except Exception as e:
            print(f"  ✗ #{b.number:2d} {b.title}: {e}")
            failed += 1

    print(f"\nDone. created={created}  skipped={skipped}  failed={failed}")
    print(f"Browse: {args.url}/buglist.cgi?product={PRODUCT_NAME}")


if __name__ == "__main__":
    main()
