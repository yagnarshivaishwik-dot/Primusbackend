# Primus — Tech Debt & Long-Term Fixes

A running log of issues discovered while working on the Primus backend + kiosk.
Each entry has: what's broken, the current workaround (if any), the proper fix,
estimated effort, and risk.

Workflow: when Claude surfaces a "long-term fix" suggestion, append it here.
When tackling one, mark it `[in progress]`; when done, move it to the Resolved
section at the bottom with the date.

---

## Open

### 1. Naive vs. aware `DateTime` columns across the schema
**Symptom:** `POST /api/auth/refresh` was crashing with `can't compare offset-naive and offset-aware datetimes` whenever an admin's access token expired. Same pattern lurks in any column declared as `Column(DateTime, ...)` (without `timezone=True`) that gets compared against `datetime.now(UTC)`.
**Current workaround:** Defensive normalization at the single comparison site in `backend/app/auth/tokens.py:207` (`expires_at.replace(tzinfo=UTC)` if naive). Same pattern exists at `backend/app/api/endpoints/client_pc.py:101-103` for license expiry.
**Proper fix:** Migrate `DateTime` columns to `DateTime(timezone=True)` (i.e. PostgreSQL `TIMESTAMPTZ`). Alembic migration with `ALTER TABLE ... ALTER COLUMN ... TYPE TIMESTAMPTZ USING ... AT TIME ZONE 'UTC'`. Then strip the defensive normalization code.
**Effort:** ~45 min for RefreshToken only; ~2 hrs for all auth/access-control tables (sessions, licenses, PCs); ~4-6 hrs project-wide.
**Risk:** Medium for project-wide — long ALTER TABLE locks, needs DB backup before running in prod.

### 2. CSRF protection is bypassed via an ever-growing skip list
**Symptom:** Every new admin/kiosk router has to be added to `should_skip_csrf_check()` or it 403s. Currently ~60 prefixes in the skip list.
**Current workaround:** Skip list expanded to cover every known router (auth, payment, internal, subscription, upi, quests, pcban, device, admin/sessions, etc., both `/api/` and `/api/v1/`).
**Proper fix:** Bypass CSRF entirely for any request that authenticates via `Authorization: Bearer ...`. JWT-in-header auth is already CSRF-immune by browser same-origin rules. Roughly: at the top of the CSRF check, `if request.headers.get("Authorization", "").startswith("Bearer "): return True`. Retires the entire skip list.
**Effort:** ~1 hr including test sweep across kiosk + admin flows.
**Risk:** Low. The skip list already accepts every Bearer-auth path; this just makes it implicit.

### 3. Soft-delete + `UNIQUE` constraint on `offers.name`
**Symptom:** Admin can't reuse an offer name after deleting one — the row is soft-deleted (`active=False`) but the UNIQUE constraint still holds the name.
**Current workaround:** None. User flagged it but we deferred.
**Proper fix:** Drop the unconditional unique index. Replace with a **partial unique index** on `(name)` `WHERE active = true`. One Alembic migration + one query change.
**Effort:** ~1 hr.
**Risk:** Low. Backwards-compatible — active offers still get name uniqueness, deactivated ones don't.

### 4. Duplicate `paid` column in `Session` model
**Symptom:** `backend/app/models.py` lines 110-111 declare `paid = Column(Boolean, default=False)` twice in the `Session` class. SQLAlchemy silently uses the last one, so nothing breaks today, but it's a schema-corruption time bomb (future migrations or `Session.paid` references will use the second declaration).
**Current workaround:** None. Cosmetic.
**Proper fix:** Delete the duplicate line. No migration needed (the column is unique in DB).
**Effort:** 1 min.
**Risk:** None.

### 5. `idempotency.py` middleware exists but is never wired in
**Symptom:** File `backend/app/middleware/idempotency.py` is implemented (presumably for `Idempotency-Key` header support on payment endpoints) but `main.py` never imports or registers it. Payment endpoints are silently NOT idempotent.
**Current workaround:** None. Cashfree's own order-ID logic provides partial idempotency.
**Proper fix:** Either wire the middleware in `main.py` AND test it doesn't break flows, OR delete the file. Decide based on whether the team wants `Idempotency-Key` support.
**Effort:** ~1 hr if wiring, 5 min if deleting.
**Risk:** Medium if wiring — could change response behavior for retried POSTs.

### 6. `ProvisioningTokenStore` C# class referenced but doesn't exist
**Symptom:** `Primus C#/PrimusKiosk.Core/Infrastructure/PrimusSettings.cs` references `Device.ProvisioningTokenStore` in comments. The class file at `PrimusKiosk.Core/Device/ProvisioningTokenStore.cs` doesn't exist. The `ProvisioningTokenPath` setting in `appsettings.json` points to a `provisioning_token.txt` file that nothing reads.
**Current workaround:** Operators do manual setup via the SetupViewModel UI (type license key by hand). The auto-provisioning-via-token-file flow is unimplemented.
**Proper fix:** Either (a) implement `ProvisioningTokenStore` to enable zero-touch provisioning at install time, or (b) remove the comments + setting and document the manual flow.
**Effort:** ~3-4 hrs if implementing.
**Risk:** Low. Net-new feature; doesn't change current behavior.

### 7. "Lance Backend Running" developer-name string in root endpoint
**Symptom:** `GET /` returns `{"message": "Lance Backend Running", "version": "1.0.0"}`. Looks like a leftover developer name in a publicly reachable response.
**Current workaround:** None.
**Proper fix:** Change to `"Primus Backend Running"` in `backend/app/main.py:644`.
**Effort:** 30 sec.
**Risk:** None.

### 8. Shop router double-mounted (intentional, but causes OpenAPI dedup pain)
**Symptom:** `main.py` mounts `shop.router` under both `/api/shop` and `/api/v1/shop`. OpenAPI docs list every shop route twice.
**Current workaround:** Intentional for client compatibility — older clients hit `/api/shop`, newer ones hit `/api/v1/shop`.
**Proper fix:** Pick one canonical mount; have the other redirect (301). OR accept the duplication as the cost of backward compat.
**Effort:** ~30 min.
**Risk:** Low if redirect-only.

### 9. `RefreshToken` model defined twice (legacy + multi-DB modules)
**Symptom:** `backend/app/models.py:52` AND `backend/app/db/models_global.py:99` both define `class RefreshToken`. Conditional imports in endpoints pick one based on `MULTI_DB_ENABLED`. Easy to update one and forget the other.
**Current workaround:** Both are kept in sync manually.
**Proper fix:** Complete the migration to `models_global.py` and delete the legacy `models.py` copy. Same applies to every model duplicated this way.
**Effort:** ~3-4 hrs (lots of models, lots of imports).
**Risk:** Medium. Has to be done carefully — any missed import path becomes a runtime error.

### 10. `Game` model has no popularity column
**Symptom:** Our `GET /api/games/popular` endpoint (added by us) returns games ordered by `id` because there's no `play_count`, `is_popular`, or `featured` column on `Game`. The kiosk JS expects `is_popular` and shows a "Popular" badge based on it — currently never shown.
**Current workaround:** Endpoint returns enabled games ordered by id. Badge never appears.
**Proper fix:** Add `is_popular: bool` (admin-toggleable) and/or `play_count: int` (auto-incremented on session start) to the `Game` model. Migration + admin UI toggle + endpoint sorts by `(is_popular DESC, play_count DESC, id ASC)`.
**Effort:** ~2 hrs.
**Risk:** Low.

### 11. Heartbeat HMAC scheme differs between two endpoints (by design, but worth knowing)
**Symptom:** `POST /api/clientpc/heartbeat` uses `method+path+timestamp+nonce+body` HMAC via `verify_device_signature()`. `POST /api/clientpc/heartbeat/{pc_id}` uses `timestamp+body` only. Two different security contracts for the "same" thing.
**Current workaround:** None — both work as designed, but it's a footgun for future devs.
**Proper fix:** Consolidate `heartbeat/{pc_id}` to use `verify_device_signature()` too. Or document the distinction prominently.
**Effort:** ~30 min.
**Risk:** Low — the simple endpoint is rarely used.

### 12. Legacy `PrimusClient/` folder still in team git repo
**Symptom:** Team's fresh git pull contains `PrimusClient/` (the legacy Tauri/blue UI). It's no longer referenced by anything that ships — only by fallback paths in `build-installer.ps1`. ~hundreds of MB of dead code + Rust build artifacts.
**Current workaround:** I deleted it from MY local working copy. Team's git still has it.
**Proper fix:** `git rm -r PrimusClient/` in the team repo, drop the fallback paths in `build-installer.ps1`. Document in CHANGELOG.
**Effort:** 10 min.
**Risk:** None — confirmed via grep that nothing live references it.

### 13. **CRITICAL: Multi-DB schema management is split + per-cafe DBs aren't tracked by alembic**
**Symptom:** The project has 3 alembic chains (`alembic/`, `alembic_global/`, `alembic_cafe/`) but in practice none of them keep the multi-DB schema in sync. Confirmed 2026-05-14 by inspecting prod:
  - `clutchhh_global` is missing all 3 global-base tables (`subscriptions`, `invoices`, `platform_financial_audit`).
  - All 16 per-cafe DBs (`clutchhh_cafe_1` through `clutchhh_cafe_16`) have NO `alembic_version` table — they aren't tracked by alembic at all. They were bootstrapped with `metadata.create_all()` at provisioning time and never migrated since.
  - 2 cafe-base tables (`squad_bookings`, `time_slot_pricing_rules`) are missing from cafe DBs because they were added to `models_cafe.py` after provisioning.
  - The main `alembic/` chain is broken because `010_offer_inventory_v2.py` declares a parent `009_phase4_audit_chain` that doesn't exist in the repo (still broken).
**Status:** Local DB fixed 2026-05-14 using `metadata.create_all()` against `clutchhh_global` (single-DB mode locally). The misfired migration file `006_create_missing_tables.py` was created in the wrong chain (`alembic/` instead of `alembic_global/`) and applied to `clutchhh_db` — needs to be undone. Prod is still broken for 5 features: subscriptions, invoices, platform_financial_audit, squad_bookings, time_slot_pricing_rules.
**Proper fix (remaining work):**
  - (a) Revert local's misfired alembic state (drop misplaced tables from `clutchhh_db`, downgrade to `004`, delete `006_create_missing_tables.py` from `alembic/versions/`).
  - (b) Write `alembic_global/versions/0003_*.py` to create the 3 global tables. Apply on prod via `alembic --config alembic_global.ini upgrade head` with backup.
  - (c) For the 2 missing cafe tables: either bring all 16 per-cafe DBs under `alembic_cafe/` management (significant architectural work) OR write a one-shot loop script that runs `CREATE TABLE` on each cafe DB. The latter unblocks the features fast; the former is the proper long-term solution.
  - (d) Restore/recreate `009_phase4_audit_chain.py` so the main chain is unbroken — or rebase `010_offer_inventory_v2.py` onto a real parent.
  - (e) Add CI checks: (1) fail if a model change has no migration; (2) audit that every per-cafe DB is in sync with `models_cafe.py` schema.
**Effort:** ~6-8 hrs total split across the 5 items above.
**Risk:** High for (c) — applying changes to 16 production cafe DBs in a loop is error-prone; needs careful rollback plan + per-DB backup.

### 14. Half-shipped features with no consumer flow (verified 2026-05-14)
**Symptom:** Multiple features have backend models + endpoints (sometimes) but no UI consumer. Verified via codebase grep:
  - `campaigns`: full admin CRUD endpoint, but zero downstream consumer (no kiosk banner, no checkout discount auto-apply, no notification). Operators fill in data that has no effect.
  - `subscriptions`: backend endpoint exists, admin UI is a `<PlaceholderPage>`, no API calls.
  - `invoices`: backend endpoint exists, no caller anywhere.
  - `platform_financial_audit`: no endpoint, no UI, model-only.
  - `squad_bookings`: model + schemas exist, NO endpoint registered, no UI.
  - `time_slot_pricing_rules`: full backend CRUD endpoint (`pricing.py`), zero frontend caller.
**Current workaround:** None — the features are silent no-ops. For `campaigns`, admin can save records with no downstream effect. For others, the buttons either don't exist or render placeholders.
**Proper fix:** Per-feature triage with the team. For each: decide (a) build the consumer UI, (b) wire up the silent business logic (e.g. apply discount at checkout for campaigns), or (c) explicitly drop the feature. **Don't create the missing DB tables until the feature is genuinely being built** — speculative scaffolding makes the schema drift you have to manage later. The migration ships with the feature.
**Effort:** Variable per feature. Cheapest is to delete dead code (squad_bookings, platform_financial_audit). Most expensive is finishing campaigns (banner UI + discount logic).
**Risk:** Low for triage. Creating tables now without the feature is worse than leaving them missing — it gives the illusion of a working system.

### 15. **CRITICAL: RLS is "mandatory" per docs but enabled on zero tables in prod**
**Symptom:** `PRIMUS_KT_PORTAL.html` and `PRIMUS_SAD_Enterprise.html` both describe Row-Level Security as the *primary* tenant-isolation mechanism in production ("Tenant isolation is in the database, not the application"). Verified on prod 2026-05-14: `SELECT rowsecurity FROM pg_tables WHERE schemaname='public'` against `clutchhh_global` returns `f` (false) for every single one of 51 user tables, and `SELECT * FROM pg_policies` returns 0 rows.
**Current workaround:** Per-cafe DBs provide physical tenant isolation (each cafe = its own DB). Global tables that should have tenant data (e.g. `licenses.cafe_id`, `wallet_transactions.cafe_id`) rely entirely on application-level filtering. If application code has a bug that omits a `WHERE cafe_id = ?`, cross-tenant data leaks become possible.
**Proper fix:** Either (a) implement RLS per the docs (audit every global table with a `cafe_id` column, add `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY ... USING (cafe_id = current_setting('app.cafe_id')::int)`, and set the GUC per-request in the backend middleware), or (b) update the docs to reflect that RLS was descoped and tenant isolation in `clutchhh_global` is application-level only.
**Effort:** ~6-10 hrs for full RLS rollout (audit + migrations + middleware + tests) on global tables. Or ~30 min to update the docs.
**Risk:** High if RLS goes wrong — a too-strict policy can lock you out of legitimate queries; a too-loose policy gives false security. Needs careful staging-first rollout.
**Symptom:** `CASHFREE_WEBHOOK_SECRET` is blank in our local `.env`. Cashfree's servers can't reach `localhost:8000` to deliver webhooks. So in local dev, sandbox payments can succeed on the user's side but never auto-credit to the wallet.
**Current workaround:** Manual order-status polling, or manually mark orders as paid in DB during testing.
**Proper fix:** Set up a Cloudflare tunnel (or ngrok) exposing `localhost:8000` as a public HTTPS URL, whitelist that URL as origin + webhook in the Cashfree dashboard, set `CASHFREE_WEBHOOK_SECRET` from the dashboard.
**Effort:** ~30 min once Cashfree dashboard access is sorted.
**Risk:** None for dev. Don't ship tunnel config to prod.

### 17. **CRITICAL: Cashfree webhook handler crashes in MULTI_DB mode**
**Symptom:** `POST /api/v1/payment/cashfree/webhook` returns 500 in MULTI_DB mode with `psycopg2.errors.UndefinedColumn: column wallet_transactions.cafe_id does not exist`. Verified 2026-05-15 via a synthetic webhook test that passed HMAC signature verification (good) but then crashed during idempotency check on the wallet ledger query.
**Root cause:** `app/api/endpoints/cashfree.py` line ~37 imports cafe-scoped models from the legacy `app.models` (which still has `cafe_id` columns) instead of `app.db.models_cafe` (which has the cafe-DB-correct schema with no cafe_id columns). Same pattern bug exists at WS PC auth — code that assumed single-DB still references `cafe_id`.
**Impact in production:** Prod runs MULTI_DB=true. Every real Cashfree PAYMENT_SUCCESS webhook in prod currently crashes with a 500 → wallet/time-pack is never credited despite payment going through on Cashfree's side. Customers pay, the system doesn't reflect it. Severity: **HIGH** if anyone has actually completed a Cashfree payment on prod and never got their time credited.
**Proper fix:** Make the imports conditional in `cashfree.py` (same pattern as `client_pc.py` does for ClientPC):
```python
if MULTI_DB_ENABLED:
    from app.db.models_cafe import Offer, UserOffer, WalletTransaction
    from app.db.models_global import User
else:
    from app.models import Offer, User, UserOffer, WalletTransaction
```
Then audit every reference to `WalletTransaction.cafe_id`, `Offer.cafe_id`, `UserOffer.cafe_id` in this file and adjust queries — in multi-DB mode those columns don't exist.
**Effort:** ~1-2 hrs including testing the full flow (create order → webhook → wallet credit → event broadcast → kiosk receives update). Replicable locally now that we have parity.
**Risk:** High if done sloppy — touches the money path. Test with synthetic webhook script before declaring done.

### 18. Kiosk `ResolveWebRoot()` falls through to a stale `web/` next to the exe
**Symptom:** Deploys to `Primus C#/web/` are silently ignored by the kiosk if a folder `bin/Debug/net8.0-windows/win-x64/web/` exists. The kiosk's `ResolveWebRoot()` (in `App.xaml.cs`) probes candidates in order: (1) `.\web\` next to the exe, (2) `..\web\` (Primus C#/web/), (3) Program Files, (4) PrimusClient/dist. It picks the FIRST one with an `index.html`. Wasted ~6 hrs of "nothing changed" debugging on 2026-05-16 because dotnet builds replicate a stale dist into `bin/Debug/.../web/` and that overrides every later deploy.
**Current workaround:** Always deploy to BOTH `Primus C#/web/` AND `bin/Debug/net8.0-windows/win-x64/web/`. Or delete the bin/Debug/.../web/ before each deploy.
**Proper fix:** Either (a) reorder the candidates so the project's `Primus C#/web/` is checked FIRST, or (b) remove the bin/Debug candidate entirely (it's a build-side mirror, not a deploy target), or (c) document this prominently so future devs don't lose hours to it.
**Effort:** ~10 min to reorder candidates in `App.xaml.cs:105-140`.
**Risk:** Low. Could mildly affect the installed-layout case if anyone relies on the `.\web\` precedence — but that case is covered by candidate #3 (Program Files) anyway.

### 24. Session timer is frontend-only, doesn't survive kiosk reload
**Symptom:** The session pill in `AppHeader` (top-right of every full-screen page) shows time elapsed since login as `HH:MM:SS`. Today the clock starts from `sessionStartedAt = Date.now()` captured in `useSessionStore` at sign-in time and persisted to localStorage. That works for normal kiosk use but has two failure modes:
  1. **Kiosk relaunch mid-session**: the React `useSessionStore.persist` blob includes `sessionStartedAt`, so the clock survives a normal SPA reload. But if the C# host clears local app data (uninstall/reinstall, profile reset, recovery script) the customer's session timer resets to 0 even though their actual cafe session is mid-flight per the backend's `sessions` table.
  2. **Multi-device**: a customer who logs in on PC #1, then walks to PC #2 (same JWT, both bound to same cafe), gets two independent timers — neither matches the real session start.
**Current workaround:** Accept the drift. Frontend timer is "approximate elapsed time on this PC", not "real session duration".
**Proper fix:** Add `GET /api/v1/session/current` returning `{ session_id, started_at }` for the authenticated user's active session row (from the cafe DB's `sessions` table). `AppHeader` (or `useSessionStore.refreshMe`) hits it on mount and uses `now - started_at` instead of the locally-captured timestamp. Backend already has the row — billing.py / `sessions` table is the source of truth.
**Effort:** ~30 min — one read endpoint + small frontend swap.
**Risk:** Low. Read-only endpoint; existing local-timestamp path stays as a fallback if the endpoint 404s.

### 23. Kiosk customer login doesn't auto-provision a CafeUser row
**Symptom:** When a customer (or admin) logs in on a kiosk, their global user record exists but no corresponding row is written to the device's bound cafe-DB `users` table. Any endpoint that needs to credit coins / wallet / track per-cafe state will fail with "User not found in cafe DB" until something else provisions the row. We worked around this on 2026-05-19 by auto-provisioning inside [home.py](backend/app/api/endpoints/home.py) and [quests.py](backend/app/api/endpoints/quests.py) claim endpoints — but that's a band-aid, every new endpoint that touches a cafe-local user has to remember to do the same dance.
**Current workaround:** In-endpoint auto-provision with `role="client"` and zero balances. Logged via `logger.info` so we can spot how often it fires in prod.
**Proper fix:** Do the auto-provision once in [auth.py](backend/app/api/endpoints/auth.py) at customer-login time. When `login` (or `register`) succeeds AND the JWT carries a `cafe_id`, insert a `CafeUser` row keyed by `global_user_id` for that cafe before issuing the token. Idempotent on conflict. Removes the workaround from every consumer endpoint.
**Effort:** ~1 hr (one helper + two call sites). Needs a small migration if we want a uniqueness constraint on `(cafe_id-implicit-via-DB, global_user_id)` to make it conflict-safe.
**Risk:** Low. Additive — endpoints that already work continue to work.

### 19. Quest claim credits coins but XP rewards are silently dropped
**Symptom:** `POST /api/v1/quests/{event_id}/claim` (`backend/app/api/endpoints/quests.py`) now credits coin rewards into `CafeUser.coins_balance` and writes a `CoinTransaction` row. XP rewards (e.g. quests with `rule_json.reward.kind="xp"`) are logged to the server log but **never banked anywhere** — `CafeUser` has no `xp` / `experience_points` column. The kiosk home page renders the XP reward badge ("+50 XP") so customers expect XP to accumulate, but no user-visible counter exists and the value is discarded.
**Current workaround:** Author quests with `reward.kind="coins"` only. Anything authored with `kind="xp"` is effectively decorative.
**Proper fix:**
  - Add `users.xp` column (Integer, default 0) to the cafe DB schema via an `alembic_cafe` migration. **Blocked on item #13** — the alembic_cafe chain has a phantom `f8c2a4d61b03` reference that needs repairing first, otherwise the new migration can't be applied cleanly across the existing cafe DBs.
  - Mirror the coins pattern in `claim_quest`: when `reward.kind == "xp"`, increment `user.xp` and write an `XpTransaction` audit row.
  - Surface XP in `/api/me` and a wallet event ('xp_updated') so the BottomNav can show it.
**Effort:** ~30 min once #13 unblocks; ~2 hrs end-to-end including the UI surface.
**Risk:** Medium — touches the cafe schema and the user object, so RLS policies need to follow.

### 20. HomePage "Happy Hour" card is mocked — no backend summary endpoint
**Symptom:** `ClutcHH-1/src/features/home/pages/HomePage.jsx` renders a "Happy Hour: 2-5 PM, 30% EXTRA on all sessions" card. The values are hardcoded in JSX. There is no `/api/v1/happy-hour/current` (or similar) endpoint that summarises the currently-active time-windowed offer for a cafe. Happy-hour-style discounts DO exist as time-windowed rows in `PricingRule` / `TimeSlotPricingRule` / `Discount`, but nothing aggregates "what's the active hourly bonus right now and when does the next one start."
**Current workaround:** The card is treated as branding, not functional. The "Learn More" button now routes to the Shop page so the customer at least lands somewhere sensible.
**Proper fix:** New `GET /api/v1/happy-hour/current` endpoint returning `{ active: bool, label: str, percent_extra: float, starts_at: iso, ends_at: iso }`. Source from `PricingRule`/`TimeSlotPricingRule` filtered on the current wall-clock, or from a new `Promotion` model if we want explicit "happy hour" semantics distinct from base rate tables. Then make the HomePage card data-driven.
**Effort:** ~1-2 hrs (one endpoint + one schema + frontend wiring).
**Risk:** Low — additive only.

### 21. Quest system has no operator workflow — admin CRUD + progression engine missing
**Symptom:** `POST /api/v1/event/` exists ([backend/app/api/endpoints/event.py:16](backend/app/api/endpoints/event.py:16)) and can technically create a quest row, but:
  1. **No admin UI** wraps it. `primus-admin-main` has zero pages for managing quests/events. Operators would have to hand-craft a curl/SQL call to author a quest.
  2. **No progression engine.** Nothing in the backend auto-increments `EventProgress.progress` when the customer does the thing the quest tracks. "Daily Check-In" doesn't trigger on login, "Streak Master" doesn't count consecutive days, "Hour Power" doesn't tick as session minutes accrue. The only mutation path is the raw `POST /api/v1/event/progress/{id}` endpoint, which no kiosk code currently calls.
  3. Net effect: even if a quest is created, no customer can ever make it claimable.
**Consequence on the kiosk home page:** A data-driven "Almost there!" panel would be empty forever for every customer. So [HomePage.jsx](ClutcHH-1/src/features/home/pages/HomePage.jsx) keeps a hardcoded `QUESTS` placeholder array — three mocked quests with a non-functional "Claim!" badge — until both pieces below ship.
**Current workaround:** Hardcoded placeholder UI on home. The live wiring (kiosk: `features/quests/services/questsService.js`; backend: claim endpoint in `quests.py` that credits coins) is implemented and dormant — the home page can flip from mock to live in a single edit once the gaps below close.
**Proper fix (three pieces):**
  - (a) **Admin UI for quest CRUD** in `primus-admin-main` — a `Quests` page that lists active quests, lets the operator create/edit/deactivate, and edits `rule_json` (target + reward shape) with a structured form, not raw JSON.
  - (b) **Progression engine** as a backend service that listens for the right domain events (login → daily check-in progress, session-billing tick → playtime progress, etc.) and increments the matching `EventProgress` rows. Likely a Celery task subscribed to the same event stream the audit log uses.
  - (c) Item #19 (add `users.xp` column + bank XP on claim) — sub-task; coins already credit correctly.
**Effort:** Admin CRUD ~1 day. Progression engine ~2-3 days (depends on which quest types are in v1). XP column ~30 min once #13 unblocks.
**Risk:** Medium. Touches user-visible engagement loops — needs review of which actions actually fire progress to avoid double-counting (e.g., if both the kiosk and a backend signal increment "Hour Power" the user gets 2 minutes per real minute).

### 22. HomePage carousel slides are hardcoded — no featured/recently-played games endpoint
**Symptom:** [HomePage.jsx](ClutcHH-1/src/features/home/pages/HomePage.jsx) renders three fixed hero slides (NEONBLADE / VALORSHIFT / STORMRIFT) with stock Unsplash images and Google CDN sample videos. The slides don't reflect anything in the cafe's actual games catalog, and the LAUNCH CTA is a no-op (`<button>` with no `onClick`) because the slide games don't exist in the catalog.
**Current workaround:** Treated as branding/showcase. Customers find real games through the Games & Apps tab via BottomNav.
**Proper fix:** Pick a feeder query and add an endpoint:
  - **Option A — "most recently played at this cafe"**: `GET /api/v1/games/recent?limit=5` aggregating recent session-launches.
  - **Option B — "featured by admin"**: a `featured` flag on the `Game` model + a tiny admin toggle in the games CRUD page. Operator picks the 3–5 games that appear on home.
  - **Option C — "popular at this cafe"**: `GET /api/v1/games/popular?limit=5` ordered by lifetime launches.
  Then make HomePage's `SLIDES` come from that endpoint and wire LAUNCH → `gamesService.launch()`. The `gamesService.list({ limit })` plumbing already exists, so the carousel can flip to live data in one edit.
**Effort:** ~2-3 hrs (endpoint + frontend wiring). Option B adds another ~1 hr for the admin toggle.
**Risk:** Low. Additive only; existing routes unaffected.

### 16. Kiosk Shop tab "disappearing packs" / stale-UI bug
**Symptom:** After the admin creates or updates a time-pack, the kiosk's Shop tab continues to show "No packs configured" (or shows the old list) until the user navigates Home → Shop manually or fully relaunches the kiosk. Reproducible 2026-05-15. Even worse, packs that DID show can disappear again after some idle time. Affects production UX — operators can't expect cafe customers to log out/in to see new packs.
**Current workaround:** Hard relaunch: `taskkill /F /IM PrimusClient.exe` + relaunch + re-login. Pack visible reliably for ~2 min after.
**Root cause (two stacked bugs):**
  - (a) The React kiosk UI in `ClutcHH-1` has no refetch hook on the Shop tab — no `useEffect` polling, no refetch-on-focus, no listener for the backend's WebSocket invalidation events. First fetch is cached; if that fetch was 401 mid-multi-DB-flip or returned an empty list at boot, the cached empty state sticks.
  - (b) The WebSocket `/ws/pc/{pc_id}` was earlier flapping due to multi-DB PC-row routing. Fixed 2026-05-15 by migrating the PC row to clutchhh_cafe_1. But even with WS now stable, if the React listener doesn't exist, the UI ignores invalidation events.
**Proper fix:** Requires `ClutcHH-1` React source (not currently checked out — blocked on PR #14 / handoff from old dev).
  - Option A: Add SWR / React Query with `refetchOnWindowFocus: true` and `refetchInterval: 30000`. Simplest, no backend changes.
  - Option B: Wire a `useEffect` listener for WS messages with `scope: "shop_offers"` and trigger refetch. Most "correct" — uses the invalidation events backend already publishes.
  - Option C: Add a manual "Refresh" button on the Shop tab as a low-effort interim.
**Effort:** ~30-60 min once ClutcHH-1 is available.
**Risk:** Low. Single-component frontend change.

---

## Resolved

(Move items here with date + commit hash when fixed.)

- _Nothing yet._

---

## Architectural facts from PRIMUS_KT_PORTAL.html + PRIMUS_SAD_Enterprise.html (read 2026-05-14)

Critical context that wasn't obvious from the code alone:

- **`clutchhh_db` is a TEMPLATE** for per-cafe provisioning, not an active query target. Confused this earlier.
- **`alembic/` is LEGACY** ("Pre-multi-DB; kept for historical reference"). Production migrations belong in `alembic_global/` (global schema) and `alembic_cafe/` (per-cafe schema). Anything new in `alembic/` does not flow to prod.
- **RLS (Row-Level Security) is mandatory in production.** Every global-DB table with a `cafe_id` column must have an RLS policy keyed off the `app.cafe_id` session GUC. New tables in `clutchhh_global` need both `CREATE TABLE` AND `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` in their migration.
- **Cafe provisioning flow**: new cafe → clone schema from `clutchhh_db` template → run `alembic_cafe upgrade head` on the new DB. Per-cafe DBs don't track alembic_version locally because they're bootstrapped from the template.
- **Deployment**: staging first → E2E test → manual approval → blue/green → auto-rollback. Solo-dev abridged version: backup → apply → test → keep backup ready.
- **Postgres runs natively on prod VM** (not in Docker). Only backend/Redis/Nginx/Celery/Flower/Superset are containerized.
- **Idempotency via unique indexes** is the documented pattern for Cashfree/wallet/order flows. Soft-delete via `active=False` is NOT a documented pattern — the docs prefer append-only audit logs.
- **Kiosk is untrusted**. All time, balance, permissions, screen state come from server. Client only renders. This justifies the HMAC device-auth flow we already saw in `client_pc.py`.

## Notes for future Claude sessions

- This file is the source of truth for backlog tech-debt items. Append new ones here rather than to chat history.
- When the user asks "what should we fix next" or "what's still open," **read this file first** instead of trying to remember.
- When fixing an item, move it to the Resolved section with a date and a one-line summary of the fix.
- Don't add items here that are normal feature work — only structural issues, cleanup, and bugs whose root-cause fix was deferred.
