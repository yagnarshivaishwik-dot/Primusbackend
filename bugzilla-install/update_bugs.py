#!/usr/bin/env python3
"""
Apply session-end status updates to the Bugzilla bugs we filed.

For each entry:
  - leaves a comment explaining what was done / what's still needed
  - optionally resolves the bug (RESOLVED FIXED / RESOLVED WONTFIX)

Usage:
    python update_bugs.py --url http://20.55.214.91:8081 --key API_KEY
"""
from __future__ import annotations

import argparse
import sys

import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


# Mapping from our import-summary prefix to {comment, status, resolution}.
# status / resolution=None means leave the bug open and just comment.
UPDATES = {
    "[Primus #1]": {
        "comment": (
            "Backend audit (claude/trusting-goldwasser-d550f8): the admin "
            "UI for creating coupons does not currently exist in either "
            "primus-admin-main or Primus-SuperAdmin-main — searched for "
            "/api/coupon, 'Coupon', 'coupon' across both src trees and "
            "found no creation form (only the kiosk-side redeem call in "
            "PrimusClient/src/Dashboard.jsx).\n\n"
            "Backend POST /api/v1/coupon/ accepts CouponIn "
            "{code, discount_percent, max_uses, per_user_limit, "
            "expires_at, applies_to}. The fields 'discount_paise' and "
            "'active' mentioned in the original report do NOT exist in "
            "the schema.\n\n"
            "RECLASSIFY: this is a missing-feature, not a bug. To close, "
            "the admin coupon CRUD page needs to be built."
        ),
        "status": None,  # leave open
    },
    "[Primus #2]": {
        "comment": (
            "Backend audit: payload from primus-admin-main/src/components/"
            "AdminUI.jsx::handleSave (Add Time Package modal) is "
            "{name, hours, price, description, active}, which matches "
            "OfferCreate in backend/app/api/endpoints/shop.py exactly. "
            "No schema mismatch in current code; previous report was "
            "speculative. If 'add pack' still fails in prod the cause is "
            "runtime (auth role / cafe context), not schema."
        ),
        "status": "RESOLVED",
        "resolution": "WORKSFORME",
    },
    "[Primus #3]": {
        "comment": (
            "Backend audit: no campaign creation UI exists in "
            "primus-admin-main or Primus-SuperAdmin-main (no calls to "
            "/api/campaign anywhere in either src tree). "
            "RECLASSIFY: missing-feature, not bug. To close, admin "
            "campaign CRUD page needs to be built (and ISO date "
            "validation tested then)."
        ),
        "status": None,
    },
    "[Primus #4]": {
        "comment": (
            "Audit cleanup landed in commit 699aedb (claude/trusting-"
            "goldwasser-d550f8). Removed:\n"
            "  1. CASHFREE_TRUST_UNSIGNED bypass in "
            "     app/services/cashfree_service.py::verify_webhook_signature\n"
            "  2. 'return 200 on missing signature/timestamp' branch in "
            "     app/api/endpoints/cashfree.py — now returns 401\n\n"
            "REMAINING work (NOT in this commit):\n"
            "  - Live ₹5 sandbox + production end-to-end test\n"
            "  - Confirm Cashfree JS SDK loads in WebView2 host allowlist\n"
            "  - Verify webhook signature scheme against current dashboard\n\n"
            "Resolving as FIXED for the audit items only. New bug should "
            "be filed for the live-payment verification."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #5]": {
        "comment": (
            "Hardened in commit 699aedb. Changes to "
            "app/api/endpoints/auth.py:\n"
            "  - SHA-256(token) stored in password_reset_tokens.token "
            "    (audit H5 — DB compromise no longer hands attackers "
            "    valid reset links)\n"
            "  - Generic 'Invalid or expired token' replaced with four "
            "    distinct messages: missing / invalid / already-used / "
            "    expired — kiosk reset page can now show actionable text\n"
            "  - TTL hoisted to _RESET_TOKEN_TTL = 1h (already 60min, "
            "    not 15min as the report assumed)\n\n"
            "Note: existing emailed reset links become unusable after "
            "deploy — that's the expected one-time invalidation.\n\n"
            "REMAINING: kiosk-side reset UI (covered separately by #10)."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #6]": {
        "comment": (
            "Out of scope for this session — requires:\n"
            "  - Google Cloud Console project with kiosk redirect URI\n"
            "  - GOOGLE_CLIENT_ID/SECRET rotated (currently in env.example, "
            "    audit-flagged)\n"
            "  - Frontend @react-oauth/google integration in PrimusClient\n"
            "Backend /api/social/google endpoint already exists (CSRF-exempt) "
            "and is correct."
        ),
        "status": None,
    },
    "[Primus #7]": {
        "comment": (
            "Out of scope for this session — the React source for the "
            "kiosk Homepage that ships inside Primus C#/PrimusKiosk.App/"
            "bin/.../web/assets is not in this monorepo (only the "
            "bundled minified JS is). Need access to that source repo "
            "to fix the CSS clipping."
        ),
        "status": None,
    },
    "[Primus #8]": {
        "comment": (
            "Backend audit: /api/command/send endpoint in "
            "app/api/endpoints/remote_command.py supports lock, unlock, "
            "shutdown, reboot, restart, logout, login, message, "
            "screenshot via ALLOWED_COMMANDS allowlist. Admin frontend "
            "wiring in primus-admin-main/src/components/AdminUI.jsx "
            "(sendCmd / openCommandModal / per-PC menu) calls the right "
            "endpoint with the right payload.\n\n"
            "If buttons appear DISABLED, that's the per-PC capability "
            "negotiation in lines 506/512/518/524 — pc.capabilities."
            "features must include the command name. Backend is "
            "explicitly relaxed (line 111-113 'Capability Negotiation "
            "Relaxed for now') so this is a frontend / kiosk-reporting "
            "issue, not a backend bug.\n\n"
            "If commands DON'T REACH the kiosk, check WebSocket "
            "delivery (notify_pc) and kiosk-side command handler.\n\n"
            "No backend code change needed."
        ),
        "status": "RESOLVED",
        "resolution": "WORKSFORME",
    },
    "[Primus #9]": {
        "comment": (
            "Already addressed in commit d96b1d5 — '_get_cafe_db falls "
            "back to global session in single-DB mode or when ctx has "
            "no cafe_id'. Both /api/shop/offers (admin write) and "
            "/api/shop/client/packs (kiosk read) now use the same "
            "_get_cafe_db helper, so a same-cafe admin and kiosk hit "
            "the same DB.\n\n"
            "REMAINING failure modes (not code-fixable, configuration):\n"
            "  - admin's JWT cafe_id != kiosk's JWT cafe_id (different "
            "    cafes, expected to differ)\n"
            "  - admin token has no cafe_id (single-DB writes), kiosk "
            "    token has cafe_id A (multi-DB reads from cafe A) — "
            "    fix: re-issue admin tokens with proper cafe_id"
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #10]": {
        "comment": (
            "Out of scope for this session — there is no in-app reset "
            "page in PrimusClient/src (grep'd for 'reset', "
            "'ResetPassword', 'forgot-password' — only the "
            "reset_device_credentials Tauri command, unrelated). This "
            "is a feature-add (reset page + routing + token-from-URL "
            "reading), not a fix.\n\n"
            "Backend /password/forgot and /password/reset are "
            "correct after #5 fix and ready for the page when built."
        ),
        "status": None,
    },
    "[Primus #11]": {
        "comment": (
            "Out of scope for this session — same as #7, the Sidebar "
            "lives in the kiosk React source bundled into Primus C#'s "
            "web/assets/, source not in this monorepo."
        ),
        "status": None,
    },
    "[Primus #12]": {
        "comment": (
            "Out of scope for this session — the 'View all quests' UI "
            "string only appears in the bundled minified JS at "
            "Primus C#/PrimusKiosk.App/bin/.../web/assets/index-*.js, "
            "and there is no quest/Quest source code in PrimusClient, "
            "primus-admin-main, Primus-SuperAdmin-main, or backend/. "
            "The quests-rendering source is in a kiosk repo not "
            "checked into this monorepo.\n\n"
            "Backend has no quests endpoint either — likely a "
            "client-only feature reading from an analytics/event log "
            "endpoint that returns empty when no quest events have "
            "been emitted."
        ),
        "status": None,
    },
    "[Primus #13]": {
        "comment": (
            "Out of scope for this session — requires live database "
            "access + most-recent good backup, neither of which is "
            "available from a code-only audit. Plan from the bug body "
            "still applies:\n"
            "  1. Snapshot current DB state (no further writes)\n"
            "  2. Diff against latest backup; identify exactly which "
            "     SuperAdmin tables/rows are missing\n"
            "  3. Restore-from-backup vs. rebuild SuperAdmin auth\n"
            "  4. Bootstrap fresh SuperAdmin via signed server-side "
            "     script with 15-minute one-time token\n"
            "  5. Rotate JWT signing key + Vault tokens\n"
            "  6. Enable PITR + nightly automated DB snapshots"
        ),
        "status": None,
    },
}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    base = args.url.rstrip("/") + "/rest"
    s = requests.Session()
    s.headers["Accept"] = "application/json"
    s.headers["Content-Type"] = "application/json"

    def get(path, **params):
        params["Bugzilla_api_key"] = args.key
        r = s.get(base + path, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def put(path, body):
        r = s.put(
            base + path,
            params={"Bugzilla_api_key": args.key},
            json=body,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()

    print("Fetching all Primus bugs…")
    bugs = get("/bug", product="Primus", include_fields="id,summary,status,resolution")["bugs"]
    by_prefix = {}
    for b in bugs:
        for prefix in UPDATES:
            if b["summary"].startswith(prefix):
                by_prefix[prefix] = b
                break
    print(f"  matched {len(by_prefix)}/{len(UPDATES)} prefixes\n")

    for prefix, plan in UPDATES.items():
        bug = by_prefix.get(prefix)
        if not bug:
            print(f"  ✗ no Bugzilla bug found for {prefix}")
            continue

        bug_id = bug["id"]
        body = {"comment": {"body": plan["comment"]}}
        if plan.get("status"):
            body["status"] = plan["status"]
            if plan.get("resolution"):
                body["resolution"] = plan["resolution"]

        if args.dry_run:
            tail = (f" → {plan['status']}/{plan.get('resolution', '')}"
                    if plan.get("status") else " (comment only)")
            print(f"  [dry] bug {bug_id} {prefix}{tail}")
            continue

        try:
            put(f"/bug/{bug_id}", body)
            tail = (f" → {plan['status']}/{plan.get('resolution', '')}"
                    if plan.get("status") else "")
            print(f"  ✓ bug {bug_id} {prefix} updated{tail}")
        except requests.HTTPError as e:
            print(f"  ✗ bug {bug_id} {prefix}: {e.response.status_code}")
            print(f"    {e.response.text[:300]}")

    print("\nDone.")


if __name__ == "__main__":
    main()
