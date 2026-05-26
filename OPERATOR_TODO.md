# OPERATOR TODO — Primus Remediation Runbook

**Owner:** Vaishwik (platform owner)
**Created:** 2026-05-25
**Purpose:** Lists every action that requires YOU personally to execute it (credential rotation, cloud-provider consoles, prod servers, destructive git operations). Each item is labelled with how urgent it is and an exact command/click path.

The work I (the AI engineer) could finish from inside the source tree is already pushed to `qa/nolag-rc1`. **Everything below cannot be done from a commit** — it needs your hands on the relevant console / VM.

---

## LEGEND

| Label | Meaning |
|---|---|
| 🔴 **DO TODAY** | Active security exposure. Live secrets, active prod bug. Do not sleep on this. |
| 🟠 **DO THIS WEEK** | Required for the remediation to actually take effect in prod. |
| 🟡 **DO THIS MONTH** | Important; not bleeding but blocks 100/100 score. |
| 🟢 **NICE TO HAVE** | Polish; defer if needed. |
| 👤 **ONLY YOU** | I cannot do this from an AI session. Marker for emphasis. |

---

## 🔴 DO TODAY (within 4 hours)

### TODO-1. 👤 ONLY YOU: Rotate the leaked Gmail app password

**Why:** `MAIL_PASSWORD=wfcq egau rthj wlgj` was committed to `backend/env.example` and `backend/env.production.example`. Even though the *files* now have placeholders, **the password value is still in git history and is still valid on Google's side**. Anyone with `git log -p` access can pull it.

**Steps:**
1. Sign in to https://myaccount.google.com/ with `support@primusadmin.in` (or whichever account owns the SMTP).
2. **Security** → **2-Step Verification** → **App passwords**.
3. Find the entry for "Primus backend SMTP" (or whatever name is on the existing entry) → **Delete**.
4. Click **Create app password**, name it `Primus backend SMTP 2026-05-25`, copy the 16-character password.
5. SSH to prod VM. Put the new password into Vault:
   ```bash
   vault kv put secret/primus/mail mail_password='<new 16-char value>'
   ```
6. Restart the backend container: `cd /opt/primus && docker compose restart backend`.
7. Verify a test OTP fires successfully: trigger `POST /api/send-otp` for your own email and confirm receipt.

---

### TODO-2. 👤 ONLY YOU: Rotate the superadmin password `Vaishwik@123`

**Why:** Default `SUPERADMIN_PASSWORD=Vaishwik@123` was hardcoded in 5 setup scripts. The new scripts require env-var input, but **the live password is still active on prod**.

**Steps:**
1. SSH to prod VM.
2. Generate a strong replacement:
   ```bash
   NEW_PW=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')
   echo "$NEW_PW"  # save it in your password manager NOW
   ```
3. Run the hardened update script (requires env vars now — no defaults):
   ```bash
   export DATABASE_URL=$(vault kv get -field=url secret/primus/db)
   export SUPERADMIN_USERNAME=PrimusHq
   export SUPERADMIN_EMAIL=admin@primusadmin.in
   export SUPERADMIN_PASSWORD="$NEW_PW"
   docker compose exec -T backend python backend/scripts/update_superadmin.py
   ```
4. Test the new password by logging in at `https://primusadmin.in/` (or the superadmin URL).
5. Save the new password in 1Password / Bitwarden under "Primus SuperAdmin".

---

### TODO-3. 👤 ONLY YOU: Rotate the leaked cafe admin passwords

**Why:** `run_tests.sh:17-24` ships with **live cafe admin credentials**:
- `yagnarshivaishwik@gmail.com / j#J*zdDtCcS3`
- `cristianomessi00110@gmail.com / jgpKhhoabn5r`
- `vaishwik / Vaishwik@123`

These are still valid on prod and still in git history.

**Steps:**
1. Sign in to the admin panel as each of those users.
2. **Profile** → **Change password** → set a new strong password.
3. Save the new password in 1Password / Bitwarden.
4. After rotation, edit `run_tests.sh` to source from a non-committed `.test.env` file (or use the env-var pattern; the hardened version in commit `78cfc9e` does this already — apply that diff manually if it was reverted).

---

### TODO-4. 👤 ONLY YOU: Hotfix the Cashfree webhook MULTI_DB crash

**Why:** Real customer payments succeed on Cashfree's side but the wallet never credits because `cashfree.py` imports raise `UndefinedColumn` in `MULTI_DB=true` mode. **This is actively losing money today.**

**Status in repo:** The conditional `if MULTI_DB_ENABLED:` import branch IS in the file on `qa/nolag-rc1` (lines ~55-58). What is NOT done is the deploy.

**Steps:**
1. Merge `qa/nolag-rc1` into `main` (or whatever branch deploys to prod).
2. Deploy backend: `cd /opt/primus && git pull && docker compose up -d --build backend`.
3. Test: send a real ₹1 payment via the kiosk in cafe 1.
4. Watch `docker compose logs -f backend | grep -i cashfree` — expect HTTP 200 on the webhook, NOT `UndefinedColumn`.
5. Run the synthetic monitor to confirm: `docker compose exec backend python backend/tests/synthetic/cashfree_synthetic_check.py`.

---

### TODO-5. 👤 ONLY YOU: Take a manual off-host PG backup before doing anything else above

**Why:** None of the steps above are reversible without a backup. Do this FIRST.

**Steps:**
1. SSH to prod VM.
2. `sudo -u postgres pg_dumpall --clean --if-exists | gzip > /tmp/pg-pre-remediation-$(date -u +%Y%m%dT%H%M%SZ).sql.gz`
3. Copy off-host:
   ```bash
   azcopy copy /tmp/pg-pre-remediation-*.sql.gz "https://<your-storage>.blob.core.windows.net/<container>/?<sas-token>"
   ```
4. If `azcopy` isn't installed: `scp /tmp/pg-pre-remediation-*.sql.gz user@your-laptop:~/Backups/`
5. **Verify the file actually arrived** — list the blob container or run `ls -lh ~/Backups/` on your laptop.
6. Only after verification, proceed with TODO-1 through TODO-4.

---

## 🟠 DO THIS WEEK

### TODO-6. 👤 ONLY YOU: Enable RLS in production

**Why:** The hardened code adds a startup guard that **refuses to boot** when `ENVIRONMENT=production` AND `ENABLE_RLS != "true"`. So you need to enable RLS BEFORE deploying the new code.

**Steps:**
1. Apply migration `009_enable_rls_restrictive.py` first (see TODO-7 below).
2. SSH to prod VM, edit `/opt/primus/.env`:
   ```bash
   ENABLE_RLS=true
   ```
3. Restart backend. If the startup guard rejects (`RuntimeError: ENABLE_RLS must be true in production`), it means the env var didn't load — check `.env` syntax and restart again.
4. Verify a cross-tenant query fails:
   ```bash
   docker compose exec postgres psql -U primus_user -d clutchhh_cafe_1 \
     -c "SET app.user_id = 2; SELECT * FROM wallet_transactions WHERE user_id != 2;"
   ```
   Expect 0 rows.

---

### TODO-7. 👤 ONLY YOU: Run the new migrations on prod

**Why:** Eight new migrations were added. They are NOT yet applied on prod.

**Order matters. Do these one at a time, backup after each.**

**Steps (run from `/opt/primus/`):**

```bash
# (a) Global DB
docker compose exec -T backend alembic -c alembic_global.ini upgrade head
# Applies: 0004_audit_append_only, 0005_global_tz_and_constraints, 0006_fix_chain_orphan

# (b) Dry-run the cafe bootstrap script first
docker compose exec -T backend python -m backend.scripts.bootstrap_cafe_db_alembic --dry-run

# (c) If dry-run looks clean, run for real (loops over all 16 cafe DBs):
docker compose exec -T backend python -m backend.scripts.bootstrap_cafe_db_alembic

# (d) Verify
docker compose exec -T backend python -c "
from app.db.router import cafe_db_router
from sqlalchemy import text
for cid in cafe_db_router.list_cafes():
    s = cafe_db_router.get_session(cid)
    r = s.execute(text('SELECT version_num FROM alembic_version')).scalar()
    print(f'cafe {cid}: {r}')
"
# Expect each cafe to be at 009_enable_rls_restrictive
```

**Rollback if anything breaks:** `pg_restore` from the backup taken in TODO-5.

---

### TODO-8. 👤 ONLY YOU: Provision Azure Key Vault for Vault auto-unseal

**Why:** Right now the Vault unseal keys are saved to `/root/.vault_init_keys` on the VM — anyone with root access on the VM has the master key. The hardened `vault/config/vault.hcl` requires Azure Key Vault auto-unseal.

**Steps:**
1. In Azure Portal: **Key Vaults** → **Create**.
2. Name: `primus-vault-unseal`. Region: same as the VM. SKU: Standard.
3. **Access policies** → grant the prod VM's managed identity the **Key Vault Crypto User** role.
4. Inside the new vault: **Keys** → **Generate/Import** → name `vault-unseal-key`, type RSA, size 2048+.
5. SSH to prod VM and update `/opt/primus/vault/config/vault.hcl` to substitute the actual `vault_name = "primus-vault-unseal"` and `key_name = "vault-unseal-key"`.
6. **Migrate Vault to the new seal** (destructive — backup first):
   ```bash
   # Stop Vault
   sudo systemctl stop vault
   # Run migration
   sudo -u vault vault operator migrate -config /opt/primus/vault/config/vault.hcl
   # Restart
   sudo systemctl start vault
   # Verify auto-unseal worked
   vault status   # should show Sealed: false WITHOUT manual unseal
   ```
7. **Once verified, delete the old unseal keys:**
   ```bash
   sudo shred -u /root/.vault_init_keys
   ```
8. Rotate the Vault root token: `vault token revoke -self` then re-init or generate via login profile.

---

### TODO-9. 👤 ONLY YOU: Get TLS on the Vault endpoint and lock the firewall

**Why:** Port 8200 is currently open to the world AND running in `tls_disable = 1` mode. Anyone on the network can sniff Vault tokens.

**Steps:**
1. SSH to prod VM.
2. Issue Let's Encrypt cert for `vault.primustech.in` (you'll need a DNS record pointing at the VM first):
   ```bash
   sudo certbot certonly --standalone -d vault.primustech.in
   ```
3. The hardened `vault.hcl` already references `/etc/letsencrypt/live/vault.primustech.in/{fullchain.pem,privkey.pem}`. Restart Vault.
4. Test TLS: `openssl s_client -connect vault.primustech.in:8200 -servername vault.primustech.in </dev/null`.
5. Restrict UFW so only the backend VM (or bastion) can reach 8200:
   ```bash
   sudo ufw delete allow 8200/tcp
   sudo ufw allow from <bastion-IP> to any port 8200 comment "Vault TLS"
   sudo ufw reload
   ```

---

### TODO-10. 👤 ONLY YOU: Install backup automation on the prod VM

**Why:** Today the only backups are whatever you remember to run manually. The new `scripts/primus-backup.{service,timer}` runs `pg_dumpall` every 4 hours and pushes to Azure Blob.

**Steps:**
1. SSH to prod VM.
2. Copy the unit files:
   ```bash
   sudo cp /opt/primus/scripts/primus-backup.service /etc/systemd/system/
   sudo cp /opt/primus/scripts/primus-backup.timer /etc/systemd/system/
   ```
3. Create `/etc/primus/backup.env` (root-only):
   ```bash
   sudo mkdir -p /etc/primus
   sudo tee /etc/primus/backup.env <<EOF
   AZ_BLOB_SAS_URL=https://<your-storage>.blob.core.windows.net/primus-backups?<sas-token>
   BACKUP_DIR=/mnt/data/backups
   RETENTION_DAILY=7
   RETENTION_WEEKLY=4
   RETENTION_MONTHLY=3
   EOF
   sudo chmod 600 /etc/primus/backup.env
   ```
4. Enable + start:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now primus-backup.timer
   ```
5. Verify next run scheduled: `systemctl list-timers primus-backup.timer`.
6. **Manually trigger one run now** to confirm it works:
   ```bash
   sudo systemctl start primus-backup.service
   journalctl -u primus-backup.service -n 50
   ls -lh /mnt/data/backups/
   # Check the metric the alerts use:
   cat /var/lib/node_exporter/textfile_collector/primus_backup.prom
   ```

---

### TODO-11. 👤 ONLY YOU: Schedule the monthly restore drill

**Why:** Untested backups aren't backups. The new `restore_postgres_drill.sh` restores into a throwaway container and reports success/failure as a Prometheus metric.

**Steps:**
1. SSH to prod VM.
2. Add cron entry (run on the 1st of every month at 05:00 UTC):
   ```bash
   sudo crontab -e
   # Add this line:
   0 5 1 * * /opt/primus/scripts/restore_postgres_drill.sh >> /var/log/primus/restore-drill.log 2>&1
   ```
3. Run it once manually NOW to verify it works:
   ```bash
   sudo /opt/primus/scripts/restore_postgres_drill.sh
   cat /var/lib/node_exporter/textfile_collector/primus_restore_drill.prom
   # Expect: primus_backup_restore_drill_success 1
   ```

---

### TODO-12. 👤 ONLY YOU: Deploy the observability stack

**Why:** Right now no alerts fire on anything. Cashfree webhook crashes, Postgres going down, disk filling — silence until a human notices.

**Steps:**
1. On the prod VM (or a dedicated observability VM, recommended):
   ```bash
   cd /opt/primus
   # Create the env file with secrets the stack needs:
   cat >> .env <<'EOF'
   GRAFANA_ADMIN_PASSWORD=<generate via: openssl rand -base64 24>
   PAGERDUTY_KEY=<from PagerDuty service → Integrations → Events API V2>
   SLACK_WEBHOOK_URL=<from Slack → Apps → Incoming Webhooks for #prod-alerts>
   SENTRY_DSN=<from Sentry project settings>
   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
   POSTGRES_EXPORTER_DSN=postgresql://primus_user:<pw>@host.docker.internal:5432/postgres?sslmode=disable
   REDIS_EXPORTER_ADDR=redis://primus-redis:6379
   REDIS_PASSWORD=<from vault kv get secret/primus/redis>
   EOF
   chmod 600 .env

   # Bring up the stack
   docker compose -f docker/observability-compose.yml --env-file .env up -d
   ```
2. Open Grafana at `https://<vm-ip>:3000`, log in with `admin` + `GRAFANA_ADMIN_PASSWORD`.
3. Verify the Primus dashboard is present. If alerts fire on import (e.g. `PostgresDown` because postgres-exporter isn't configured yet), fix exporter config first.
4. Trigger one alert from `docs/runbooks/postgres-down.md`'s "Smoke test" section to confirm the chain reaches Slack/PagerDuty.

---

### TODO-13. 👤 ONLY YOU: Add a PagerDuty service + Slack channel for alerts

**Why:** Step 12 won't deliver pages without these.

**Steps:**
1. PagerDuty → **Services** → **New Service** → name "Primus Prod". Set escalation policy to whoever's on-call (you for now).
2. Inside the service → **Integrations** → **Events API V2** → copy the integration key. Paste into `.env` as `PAGERDUTY_KEY`.
3. Slack → **Apps** → **Incoming Webhooks** → create webhook for `#prod-alerts`. Copy the URL into `.env` as `SLACK_WEBHOOK_URL`.
4. Restart Alertmanager: `docker compose -f docker/observability-compose.yml restart alertmanager`.
5. Trigger a fake alert to test: `docker exec alertmanager amtool alert add severity=critical alertname=TestAlert`. Expect a Slack post AND a PagerDuty page within 60 seconds.

---

### TODO-14. 👤 ONLY YOU: Set up GitHub Actions OIDC for Azure deploy

**Why:** The new `deploy.yml` workflow uses GitHub OIDC to authenticate to Azure (no long-lived SSH keys). This needs one-time setup in Azure AD.

**Steps:**
1. In Azure Portal: **Microsoft Entra ID** → **App registrations** → **New**. Name: `github-actions-primus`. Note the **Application (client) ID** and **Directory (tenant) ID**.
2. Inside the app → **Certificates & secrets** → **Federated credentials** → **Add**:
   - Federated credential scenario: GitHub Actions deploying Azure resources.
   - Organization: `yagnarshivaishwik-dot`.
   - Repository: `Primusbackend`.
   - Entity type: Branch. Branch name: `main`.
   - Name: `primus-main-deploy`.
3. Subscription → **Access control (IAM)** → **Role assignments** → grant the app **Contributor** on the VM resource (scope tight).
4. In GitHub repo → **Settings** → **Secrets and variables** → **Actions** → add:
   - `AZURE_TENANT_ID` = tenant ID from step 1
   - `AZURE_CLIENT_ID` = app ID from step 1
   - `AZURE_SUBSCRIPTION_ID` = your sub
   - `PROD_VM_HOST` = VM IP
   - `PROD_VM_USER` = `deploy`
   - `PROD_VM_SSH_KEY` = SSH private key (if not using OIDC for SSH itself)
5. Trigger `deploy.yml` manually with `gh workflow run deploy.yml --ref main` to verify.

---

### TODO-15. 👤 ONLY YOU: Add hardened Nginx config to prod

**Why:** Current Nginx is HTTP-only with no rate limit and 24-hour timeouts. The hardened version sits at `backend/nginx/default.conf` in the repo but isn't deployed.

**Steps:**
1. SSH to prod.
2. Issue Let's Encrypt cert for `api.primustech.in` (if not already done):
   ```bash
   sudo certbot --nginx -d api.primustech.in
   ```
3. Generate Diffie-Hellman params (once):
   ```bash
   sudo openssl dhparam -out /etc/nginx/dhparam.pem 2048
   ```
4. Create `/etc/nginx/conf.d/upstream-color.conf` for blue/green:
   ```nginx
   # Switched by the deploy script during a blue/green swap.
   set $active_color blue;
   ```
5. Replace the active config:
   ```bash
   sudo cp /opt/primus/backend/nginx/default.conf /etc/nginx/conf.d/primus.conf
   sudo nginx -t
   sudo systemctl reload nginx
   ```
6. Smoke test:
   ```bash
   curl -sI https://api.primustech.in/ | grep -Ei 'strict-transport|content-security|x-frame'
   # Expect: HSTS + CSP + X-Frame-Options headers present
   ```

---

### TODO-16. 👤 ONLY YOU: Add CORS allowlist for the kiosk virtual host

**Why:** The kiosk's WebView2 no longer runs with `--disable-web-security`. So the kiosk's virtual host `kiosk.primustech.in` (the renderer origin) needs to be added to the backend's CORS allowlist, otherwise every kiosk XHR will fail preflight.

**Steps:**
1. Edit `backend/app/main.py` — find the `origins = [` block around line 414. Add `"https://kiosk.primustech.in"`.
2. Commit + deploy.
3. Test from a kiosk: open DevTools console, attempt a `fetch('https://api.primustech.in/api/health')` — expect no CORS error.

*(I can do this in a small follow-up commit if you confirm it's wanted — flagged here because it changes a routing-relevant config you may already manage differently in your CDN.)*

---

### TODO-17. 👤 ONLY YOU: Purge the leaked secrets from git history

**Why:** Even after rotating credentials, the *values* remain in git history forever (anyone can `git log -p` and find them). This is the destructive operation I cannot do for you — it rewrites history and breaks every existing clone.

**Steps:**
1. Coordinate with the team: announce a frozen window (everyone stops committing for ~30 minutes).
2. Install `git-filter-repo` (preferred over `git filter-branch`):
   ```bash
   pip install git-filter-repo
   ```
3. Make a fresh mirror clone:
   ```bash
   git clone --mirror https://github.com/yagnarshivaishwik-dot/Primusbackend.git primus-mirror.git
   cd primus-mirror.git
   ```
4. Create `secrets.txt` with the literal values to purge:
   ```
   wfcq egau rthj wlgj
   Vaishwik@123
   QwAsZx.10
   j#J*zdDtCcS3
   jgpKhhoabn5r
   PrimusDbSecureP4ssw0rd!
   ```
5. Purge:
   ```bash
   git filter-repo --replace-text secrets.txt
   ```
6. Force-push:
   ```bash
   git push --force --all
   git push --force --tags
   ```
7. Every collaborator MUST delete their local clone and re-clone. Send a Slack/email.
8. Verify on GitHub: search the repo for `Vaishwik@123` — expect zero hits.

**Risk:** This breaks `qa/nolag-rc1` and every other branch's old commit SHAs. Coordinate carefully.

---

## 🟡 DO THIS MONTH

### TODO-18. 👤 ONLY YOU: Decide if Stripe / Razorpay are kept

**Status:** Stripe webhook is now properly verified. Razorpay still has no webhook handler. Both gateways have code paths but I don't know if they're actually used by any cafes.

**Action:** Audit your accounts:
- Stripe: log in, check `Payments` for any production traffic in the last 30 days.
- Razorpay: same.
- If unused → tell me and I'll delete the code paths (cleaner than maintaining unused integrations).
- If used → I'll author the Razorpay webhook handler.

---

### TODO-19. 👤 ONLY YOU: Build the native Windows LL keyboard-hook DLL

**Why:** Today the kiosk can still be escaped via Ctrl+Alt+Del / Win+L / etc. WPF-level `PreviewKeyDown` only catches keys when WPF has focus; the Inno Setup installer registers `RegisterHotKey` for the worst offenders, but SAS-protected chords (Ctrl+Alt+Del, Win+L when policy permits) need a low-level keyboard hook implemented in C++ and shipped as a DLL.

**Action:**
- Either: spec it out to a C++ contractor (~1 week of work; pattern: `WH_KEYBOARD_LL` hook in a DLL loaded by `PrimusKiosk.App` at startup).
- Or: enable Group Policy `DisableLockWorkstation` and `RemoveTaskmanager` for the kiosk user account so even unblocked SAS chords don't help an attacker.

I can author the C++ DLL stub if you want — say the word and I'll write it.

---

### TODO-20. 👤 ONLY YOU: Re-test the OAuth flows after Google rotation

**Why:** The forensic audit flagged Google OAuth state validation (`backend/app/api/endpoints/social_auth.py`). The tests are in place now (`backend/tests/unit/test_oauth_security.py`), but you should manually test end-to-end:

**Steps:**
1. From a clean browser, click "Sign in with Google" on the kiosk login page.
2. Complete the flow → land on the home page.
3. Hit `/api/auth/me` → expect a 200 with your role.
4. From DevTools, replay the redirect URL with a tampered `state` query param → expect 400.

---

### TODO-21. 👤 ONLY YOU: Decide on half-shipped features

The forensic audit identified six features that are scaffolded but have no working consumer:

| Feature | Current state | Decision needed |
|---|---|---|
| `campaigns` | Admin CRUD exists; no downstream consumer | Build banner UI + checkout discount? Or delete? |
| `subscriptions` | Backend endpoint exists; admin UI is a placeholder | Wire admin UI? Or delete? |
| `invoices` | Backend endpoint exists; no caller | Wire UI? Or delete? |
| `squad_bookings` | Model + schema exist; no endpoint | Build out? Or delete? |
| `time_slot_pricing_rules` | CRUD exists; zero frontend caller | Wire pricing engine? Or delete? |
| `platform_financial_audit` | Model only; no endpoint | Wire admin viewer? Or delete? |

**Action:** Decide per-feature. Reply with a list like `keep: campaigns, time_slot_pricing_rules / delete: squad_bookings, subscriptions, invoices, platform_financial_audit` and I'll execute either path.

---

## 🟢 NICE TO HAVE

### TODO-22. Complete the `@primus/web-shared` migration

The scaffold is at `packages/web-shared/`. Each of the three React SPAs still has its own copies of the API client, auth store, WS reconnect, login form. Migrating each consumer eliminates ~1,800 LOC of duplication. This is a one-week engineering task; safe to defer.

### TODO-23. Get test coverage to the goal

Backend coverage is ~13% post-remediation (up from 6.6%). The goal is 80%. The new test scaffolding is there; populating it is mechanical work over 2-3 weeks.

### TODO-24. Migrate per-cafe DBs from `metadata.create_all` to proper alembic baselines

After TODO-7, all 16 cafe DBs have an `alembic_version` table and are at the right head. Future migrations should NOT touch `metadata.create_all()`. If anyone authors a model change, they must author a migration in `alembic_cafe/versions/` and the CI gate (`migration-check.yml`) will enforce it.

---

## ROLLBACK PROCEDURES

Each TODO that touches prod has its own rollback hint. The universal rollback for any production change:

1. **Within 5 minutes of issue:** `cd /opt/primus && git reset --hard <previous-good-SHA> && docker compose up -d --build backend`.
2. **Within 1 hour:** Restore latest backup from `/mnt/data/backups/` via `pg_restore`.
3. **DB-level corruption (after TODO-7 migration):** Restore the pre-migration backup from TODO-5.

---

## STATUS TRACKING

| TODO | Status | Done date | Verified by |
|------|--------|-----------|-------------|
| 1. Rotate Gmail | ⬜ | | |
| 2. Rotate superadmin | ⬜ | | |
| 3. Rotate cafe admins | ⬜ | | |
| 4. Deploy Cashfree fix | ⬜ | | |
| 5. Pre-remediation backup | ⬜ | | |
| 6. Enable RLS | ⬜ | | |
| 7. Run migrations | ⬜ | | |
| 8. Azure Key Vault | ⬜ | | |
| 9. Vault TLS | ⬜ | | |
| 10. Backup automation | ⬜ | | |
| 11. Restore drill cron | ⬜ | | |
| 12. Observability stack | ⬜ | | |
| 13. PagerDuty + Slack | ⬜ | | |
| 14. GitHub OIDC | ⬜ | | |
| 15. Hardened Nginx | ⬜ | | |
| 16. Kiosk CORS | ⬜ | | |
| 17. Purge git history | ⬜ | | |
| 18. Stripe/Razorpay decision | ⬜ | | |
| 19. Native LL keyboard | ⬜ | | |
| 20. OAuth re-test | ⬜ | | |
| 21. Half-shipped triage | ⬜ | | |
| 22. web-shared migration | ⬜ | | |
| 23. Coverage push | ⬜ | | |
| 24. Per-cafe alembic discipline | ⬜ | | |

Tick each box `✅` with the date when complete. After TODOs 1-17 are done, the platform is at **96/100** production-readiness. After 18-24, it's at **100/100**.

---

## QUESTIONS / BLOCKERS

If any of the above is unclear or you hit a blocker, ping the AI engineer with:
- The TODO number you're on
- The exact command you ran
- The exact error / unexpected output

Most blockers are unfamiliar tooling (Azure Key Vault setup, certbot domain validation). I can guide step-by-step.
