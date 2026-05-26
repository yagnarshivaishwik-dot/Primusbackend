# Primus Security Policy

This document covers the security posture, supported versions, key-rotation
schedule, and vulnerability-disclosure contact for the Primus platform
(backend, kiosk, super-admin, mobile, infra).

It supersedes any inline guidance previously embedded in `TECH_DEBT.md`.

---

## Reporting a Vulnerability

If you believe you have found a security vulnerability in any Primus
component:

- Email **security@primustech.in** with a description, reproduction steps,
  and impact. PGP key (8A3F ... 9C12) on request.
- Do **not** open a public GitHub issue, post on social media, or share
  with anyone outside the maintainer team until a fix has shipped.
- We acknowledge reports within **48 hours** and aim to provide a triage
  decision within **5 business days**.
- We follow coordinated disclosure: please give us **90 days** from initial
  contact (or fewer if the issue is already actively exploited) before
  public disclosure. We will credit reporters who request it.

If you receive no response within the windows above, escalate to
**security-escalation@primustech.in** which routes to the on-call lead.

---

## Supported Versions

| Component                | Supported branches      | EOL policy                         |
| ------------------------ | ----------------------- | ---------------------------------- |
| Primus backend           | `main`, current release | Last 2 minor releases get patches  |
| Primus kiosk (Windows)   | `1.0.x` and newer       | Auto-update enforced via launcher  |
| Primus super-admin       | `main` only             | Single deployment, rolling updates |
| Primus mobile (Android)  | last 2 published stores | Older clients prompted to update   |

Older versions are explicitly **unsupported**. Critical vulnerabilities in
unsupported versions are documented in release notes but not back-patched.

---

## Key Rotation Schedule

This schedule is enforced by `app/core/startup_guards.py`, scripted via
`scripts/rotate-*.sh`, and tracked in the operations runbook
(`scripts/security/SECRET_ROTATION_RUNBOOK.md`).

| Secret                       | Rotation cadence | Owner            | Notes                                                  |
| ---------------------------- | ---------------- | ---------------- | ------------------------------------------------------ |
| `JWT_SECRET`                 | **90 days**      | Backend lead     | Use `JWT_SECRET_PREVIOUS` for soft rotation            |
| `SECRET_KEY` / `APP_SECRET`  | **90 days**      | Backend lead     | Cookie + CSRF signing keys                              |
| Database password (`POSTGRES_PASSWORD`, `DATABASE_URL`) | **30 days** | Platform lead | Coordinate with DB user-table update         |
| `CASHFREE_SECRET_KEY`        | 180 days         | Finance lead     | Coordinate with Cashfree dashboard                     |
| `CASHFREE_WEBHOOK_SECRET`    | 180 days         | Finance lead     | Regenerated in Cashfree → Webhooks UI                  |
| `STRIPE_SECRET`              | 180 days         | Finance lead     | Restricted-key model                                   |
| `STRIPE_WEBHOOK_SECRET`      | 180 days         | Finance lead     | Per-endpoint `whsec_...`                               |
| `MAIL_PASSWORD` (Gmail app)  | **30 days**      | Ops              | Google account app-passwords expire on policy change   |
| SuperAdmin bootstrap passwd  | On first login   | New user         | `setup_superadmin_azure.sh` enforces 16+ char minimum  |
| Redis password               | 90 days          | Platform lead    | Affects rate-limit + cache + revocation store          |

Rotations are tracked in `vault/rotation-log.csv`. A rotation that misses
its deadline is treated as a P1 ops incident and triggers an alert.

---

## Incident Contact

| Severity | First responder              | Backup                           | SLA       |
| -------- | ---------------------------- | -------------------------------- | --------- |
| P0       | on-call@primustech.in        | platform-lead@primustech.in      | 15 min    |
| P1       | security@primustech.in       | on-call@primustech.in            | 1 hour    |
| P2       | security@primustech.in       | —                                | 1 business day |

Phone fallback for P0 incidents: see internal PagerDuty roster.

---

## Hardening Inventory (P2 — this commit)

The following controls were added or hardened in the P2 security wave
(forensic audit BUG #20–#26, cleanup wave 2026-05-25):

1. CSRF skip list replaced with a Bearer-token policy
   (`backend/app/utils/csrf.py`).
2. Account lockout + per-email rate limit on the SuperAdmin login
   (`backend/app/api/endpoints/internal_auth.py`).
3. Cashfree webhook HMAC pinned to a single documented scheme
   (`backend/app/services/cashfree_service.py`); IP allowlist enforced
   (refuses when `CASHFREE_WEBHOOK_ALLOWED_CIDRS` is unset).
4. `ENABLE_RLS=true` enforced at startup in production
   (`backend/app/core/startup_guards.py`).
5. Stripe webhook surface added with idempotent crediting
   (`backend/app/api/endpoints/stripe_webhook.py`).
6. WebSocket auth routed through `decode_access_token_async`, so JTI
   revocation in Redis takes effect for live sockets
   (`backend/app/ws/auth.py`).
7. Pre-commit secrets scanning via gitleaks (`.gitleaks.toml`,
   `.github/workflows/secrets-scan.yml`).
8. All hardcoded DB / Gmail / SuperAdmin passwords removed from
   `backend/env.example`, `backend/scripts/init_test_db.py`,
   `backend/tests/conftest.py`, `backend/scripts/setup_superadmin_azure.sh`.

---

## Reference

- `scripts/security/SECRET_ROTATION_RUNBOOK.md` — operator-facing runbook
  for each rotation listed above.
- `TECH_DEBT.md` — open hardening items and known risks.
- `docs/threat-model.md` — STRIDE model of the platform (kept current).
