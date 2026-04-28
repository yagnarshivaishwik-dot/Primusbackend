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
            "Coupons admin page built in commit d75685a: new CouponsPage "
            "component in primus-admin-main/src/components/AdminUI.jsx "
            "with grid view + create modal. Wired into the sidebar nav "
            "(Ticket icon) and renderPage switch.\n\n"
            "Form fields match backend CouponIn exactly: code, "
            "discount_percent (0-100), max_uses, per_user_limit, "
            "expires_at (datetime-local → ISO), applies_to. cafe_id is "
            "injected from JWT, never sent. Per-card status pill shows "
            "Active / Expired / Exhausted based on expires_at and "
            "times_used."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #2]": {
        "comment": (
            "Deep-dive fix in commit dba3c5a (backend) plus uncommitted "
            "primus-admin-main edits.\n\n"
            "Schema match was already correct (name/hours/price/"
            "description/active matches OfferCreate). The real failure "
            "mode was that operational errors became 'Failed to save "
            "package' with no detail:\n\n"
            "Backend (shop.py::create_offer):\n"
            "  - Pre-validate name (non-empty), hours (>0), price (>=0) "
            "    with specific 400s instead of pydantic 422s the UI "
            "    rendered as [object Object].\n"
            "  - Catch sqlalchemy IntegrityError on commit; UNIQUE/"
            "    DUPLICATE constraint violations now return 400 with "
            "    'A pack named \"X\" already exists' instead of bubbling "
            "    as opaque 500. (Legacy single-DB Offer schema has "
            "    UNIQUE(name) which silently broke same-name packs.)\n"
            "  - Set cafe_id on the row when the model has the column "
            "    AND ctx has cafe_id, so two cafes can have a pack with "
            "    the same name without colliding.\n\n"
            "Frontend (primus-admin-main/AdminUI.jsx::handleSave):\n"
            "  - Strict pre-validate (Number.isFinite, hours>0, price>=0) "
            "    with field-specific toast messages.\n"
            "  - Render FastAPI's two error shapes correctly: "
            "    {detail: 'string'} verbatim, {detail: [{loc, msg}, ...]} "
            "    pretty-printed as 'field: msg'.\n"
            "  - Specific messages for 401 (session expired) and 403 "
            "    (no admin role for cafe), instead of falling through "
            "    to 'Failed to save package'."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #3]": {
        "comment": (
            "Campaigns admin page built in commit d75685a: new "
            "CampaignsPage component in primus-admin-main/src/components/"
            "AdminUI.jsx with grid + create/edit modal + pause-toggle + "
            "delete actions. Wired into the sidebar nav (Megaphone icon).\n\n"
            "Form fields match backend CampaignIn: name, type "
            "(discount/announcement/promotion), content, image_url, "
            "discount_percent, target_audience (all/members/guests), "
            "start_date, end_date, active. start_date/end_date are POSTed "
            "as ISO 8601 via new Date(input).toISOString() — fixes the "
            "'backend rejects naive datetime strings' suspicion from the "
            "original report. Edit hydrates by slicing the ISO back to "
            "YYYY-MM-DDTHH:mm for the datetime-local input."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
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
            "Quests panel rebuilt from scratch in PrimusClient (the C# "
            "kiosk's React source bundled into Primus C#/web/). Changes "
            "are LOCAL ONLY — not pushed to git per operator request.\n\n"
            "Files touched:\n"
            "  - PrimusClient/src/components/Widget.jsx: new "
            "    QuestsWidget export. Constrains its body to "
            "    max-height:320px + overflow-y:auto so a long quest "
            "    list can never push the layout and clip its own "
            "    header (the original symptom).\n"
            "  - PrimusClient/src/pages/HomePage.jsx: imports the "
            "    QuestsWidget, fetches /api/quests/ on mount with its "
            "    own loading/error/empty states (independent of the "
            "    games fetch), wires onClaim and onViewAll → /quests.\n\n"
            "Backend endpoint added (will need to ship): "
            "GET /api/quests/ returns active Event(type='quest') "
            "rows joined with EventProgress for the current user; "
            "POST /api/quests/{id}/claim marks one completed.\n\n"
            "Build PrimusClient (npm run build) and stage dist/ into "
            "Primus C#/web/ for the next kiosk installer."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #8]": {
        "comment": (
            "Deep-dive fix in commit dba3c5a (backend) plus uncommitted "
            "primus-admin-main edits.\n\n"
            "Two real root causes addressed:\n\n"
            "1) Frontend was DISABLING Lock/Unlock/Restart/Message buttons "
            "   when pc.capabilities.features didn't include the command "
            "   name. Backend explicitly says capabilities are relaxed "
            "   (remote_command.py:111-113), so the gate was rejecting "
            "   commands the backend would have accepted. Removed the "
            "   `disabled={pc.capabilities && !pc.capabilities.features."
            "   includes('X')}` clause from all four buttons in "
            "   primus-admin-main/AdminUI.jsx. We'd rather let the user "
            "   click and have the backend respond with a meaningful 400 "
            "   than show a button that does nothing without explanation.\n\n"
            "2) Admin had no way to tell whether a queued command would "
            "   reach the kiosk in real time vs. wait for HTTP long-poll. "
            "   client_pc.py::list_pcs now returns:\n"
            "   - ws_connected: bool — WebSocket alive, commands ship "
            "     instantly\n"
            "   - online: ws_connected OR heartbeat within 90 s\n"
            "   - seconds_since_seen: int — surfaced in the UI as '12s "
            "     ago'\n"
            "   Frontend renders Realtime (green) / Polling (yellow) / "
            "   Offline (gray) badges per PC card so admins know what to "
            "   expect when they click. sendCmd error handler now "
            "   surfaces 401/403/404 + backend detail strings verbatim "
            "   instead of always showing 'Failed to send command'."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
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
            "In-app password reset built and switched to OTP flow per "
            "operator request. Two commits:\n"
            "  - d75685a: initial token-link reset UI (now superseded)\n"
            "  - <next>: backend /password/{forgot,reset} converted to "
            "    6-digit OTP, frontend rebuilt as 2-step flow\n\n"
            "Backend (app/api/endpoints/auth.py):\n"
            "  - /password/forgot generates a 6-digit numeric OTP, hashes "
            "    it (SHA-256), stores with 10 min TTL, emails the raw "
            "    OTP. Old unused OTPs for the same user are invalidated "
            "    on issue (one active code per user).\n"
            "  - /password/reset accepts {email, otp, new_password}; "
            "    returns generic 'Invalid or expired code' when the "
            "    email/otp combo isn't found (no enumeration), but "
            "    distinguishes used / expired states for matched codes.\n\n"
            "Frontend (PrimusClient/src/login-and-register.jsx):\n"
            "  - ForgotPasswordView (step 1): email field → POSTs to "
            "    /forgot, advances to step 2 regardless (privacy)\n"
            "  - ResetPasswordView (step 2): email pre-filled, 6-digit "
            "    numeric OTP input (autocomplete one-time-code, mono "
            "    spaced), new password + confirm with min-8 + match "
            "    validation, 'Resend code' link, surfaces backend's "
            "    specific error messages verbatim"
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #11]": {
        "comment": (
            "Header / mobile nav toggle clipping fixed locally in "
            "PrimusClient. Changes are NOT pushed to git per operator "
            "request — apply via npm run build → drop dist/ into "
            "Primus C#/web/ for the next installer.\n\n"
            "Files touched:\n"
            "  - PrimusClient/src/App.css\n"
            "    .header: added gap, position-relative-friendly "
            "    overflow-x:clip so the actions stack can never crop "
            "    the toggle button.\n"
            "    .mobile-nav-toggle: position:relative + z-index:5 + "
            "    margin-right so the icon never sits flush against the "
            "    adjacent .header__icon-btn (visual cropping bug).\n"
            "    @media(max-width:1024px): now hides the inline nav "
            "    AND shows the toggle (was previously only at 768px). "
            "    Kiosk windowed mode commonly runs at ~1280×720 with "
            "    chrome, where the 7-link nav + 4 icons + user "
            "    dropdown were overflowing the available width."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
    },
    "[Primus #12]": {
        "comment": (
            "Full /quests page added locally — NOT pushed to git per "
            "operator request. Apply via npm run build of PrimusClient "
            "→ stage dist/ into Primus C#/web/.\n\n"
            "Files touched:\n"
            "  - PrimusClient/src/pages/QuestsPage.jsx (new): groups "
            "    quests into Ready-to-claim / In-progress / Completed "
            "    sections, per-quest progress bars, claim button on "
            "    ready rows. Empty state explicitly says 'no active "
            "    quests right now — admins will publish more on the "
            "    next refresh' so the page never looks broken (which "
            "    was the original #12 symptom).\n"
            "  - PrimusClient/src/App.jsx: registered <Route "
            "    path='/quests' element={<QuestsPage />} />.\n"
            "  - PrimusClient/src/components/ui/Header.jsx: added "
            "    Quests to navLinks (Target icon).\n"
            "  - PrimusClient/src/services/apiClient.ts: apiService."
            "    quests = { list, claim }.\n\n"
            "Backend endpoint (also added in this session, ships via "
            "git):\n"
            "  - app/api/endpoints/quests.py — GET /api/quests/ returns "
            "    active Event(type='quest') rows joined with "
            "    EventProgress for the current user; POST "
            "    /api/quests/{id}/claim marks completed when "
            "    progress >= target. Tolerates malformed rule_json. "
            "    Mounted in main.py at /api/quests."
        ),
        "status": "RESOLVED",
        "resolution": "FIXED",
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
