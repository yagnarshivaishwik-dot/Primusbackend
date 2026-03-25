## Primus OSS Security Baseline Demo

This directory contains a self-contained, **free / open-source security baseline** for Primus, built with Docker Compose and a minimal FastAPI demo app.

It implements:

- **TLS edge** with Nginx (Let’s Encrypt ready)
- **Argon2id** password hashing + **rate limiting / lockout**
- **TOTP MFA** (pyotp) and **OIDC** via Keycloak
- **Vault OSS** for secrets and envelope encryption (AES-256-GCM)
- **JSON audit logging**, CI hooks (Trivy + cosign), runtime security (Falco), and checks scripts.

See full instructions and acceptance tests in this file.

---

### Prerequisites

- **Docker & Docker Compose** installed locally.
- **curl**, **jq**, **openssl** on your shell.
- Optional for pentest and CI:
  - `nmap`, `gobuster`, `nikto`
  - `trivy`, `cosign`

---

### Bring up the core stack (FastAPI + Vault + Keycloak + Nginx)

From the repo root:

```bash
docker compose up -d
```

Services:

- **FastAPI app**: `http://localhost:8000`
- **Vault (dev)**: `http://localhost:8200` (token `root`)
- **Keycloak**: `http://localhost:8080` (admin/admin)
- **Nginx**: `http://primus.example.com` (once DNS + TLS are configured)

---

### Configure TLS with Let’s Encrypt (A)

- Point `primus.example.com` DNS to your Nginx host (public IP).
- On that host, obtain certificates (one-time):

```bash
sudo apt-get update && sudo apt-get install -y certbot
sudo certbot certonly --standalone -d primus.example.com
sudo cp /etc/letsencrypt/live/primus.example.com/fullchain.pem /path/to/repo/security/nginx/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/primus.example.com/privkey.pem /path/to/repo/security/nginx/certs/privkey.pem
```

Restart Nginx container:

```bash
docker restart primus-nginx
```

**Acceptance test:**

```bash
cd checks
./check_tls.sh primus.example.com
```

Verify `TLSv1.3` appears in the output and the certificate issuer is Let’s Encrypt.

---

### Vault init and DB credential/KEK setup (E)

With Vault container running:

```bash
export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=root
cd vault/init
./init-dev.sh
```

This:

- Enables KV v2 at `secret/`
- Writes `secret/primus/db` with demo credentials
- Seeds `secret/primus/master-key`
- Applies the `primus` policy.

**Acceptance test (backend pulling DB creds):**

```bash
curl -s http://localhost:8000/api/security/vault/db-creds | jq
```

You should see username/password coming from Vault.

To demo rotation:

```bash
cd checks
./check_vault_rotation.sh http://localhost:8000
```

Compare `vault-creds-before.json` vs `vault-creds-after.json` – password should change.

---

### FastAPI Argon2id + rate limiting / lockout (B)

The demo app uses `argon2-cffi` with strong parameters and keeps a simple in-memory lockout:

- 5 failed attempts within 5 minutes → 5-minute lockout with HTTP 429.

**Acceptance test:**

```bash
cd checks
./check_bruteforce.sh http://localhost:8000
```

Inspect the HTTP codes; later attempts should return `429`.

---

### TOTP MFA enrollment and login (C)

1. **Register a user**:

```bash
curl -X POST http://localhost:8000/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"StrongPassword123!"}'
```

2. **Enable TOTP** and capture `otpauth_url`:

```bash
curl -s -X POST http://localhost:8000/mfa/totp/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"StrongPassword123!"}' | jq
```

3. Import `otpauth_url` into Google Authenticator or any TOTP app.

4. **Login with MFA**:

```bash
curl -X POST http://localhost:8000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"StrongPassword123!","totp_code":"123456"}'
```

Replace `123456` with the current TOTP from your app.

**Acceptance:** login only succeeds when both password and valid TOTP code are supplied.

---

### Keycloak OIDC round-trip (D)

Keycloak comes up with the imported `primus` realm and `primus-client` plus a `demo-user`.

1. Confirm Keycloak is reachable at `http://localhost:8080`.
2. Obtain an access token and call the protected endpoint:

```bash
cd checks
./check_oidc.sh http://localhost:8080 primus-client demo-user ChangeMe123! http://localhost:8000
```

3. Inspect `oidc-protected-response.json` – it should contain the Keycloak subject and username.

---

### Envelope encryption demo with AES-256-GCM + Vault-stored KEK (F)

The backend:

- Encrypts sensitive secrets at rest (e.g., `PlatformAccount.secret`, `Webhook.secret`) using:
  - A 256-bit KEK (master key) from Vault KV.
  - A random DEK per object, with AES-256-GCM.
  - Encrypted DEK and ciphertext stored together.

**Acceptance test (API encrypt/decrypt round-trip):**

```bash
cd checks
python check_encryption.py
```

Output should state: `original == decrypted`.

---

### CI: build → Trivy scan → cosign sign (G, J)

The example GitHub Actions workflow is in `ci/oss-security-baseline.yml`.

To run the steps locally:

```bash
docker build -t primus/fastapi-security-demo:latest fastapi
trivy image primus/fastapi-security-demo:latest
cosign generate-key-pair   # once, do not commit private key
COSIGN_EXPERIMENTAL=1 cosign sign --key cosign.key primus/fastapi-security-demo:latest --dry-run
```

**Acceptance:** image builds, Trivy produces a scan report, cosign completes a (dry-run) signature.

For supply-chain and branch-protection details see `security/supply-chain.md`.

---

### Runtime security & JSON logging (H)

To run Falco + Loki/Promtail + Prometheus + Grafana:

```bash
cd docker
docker compose -f runtime-security-compose.yml up -d
```

- **Falco** monitors host/container behavior and uses a demo rule in `docker/falco/rules/primus-demo-rules.yaml`.
- **Loki/Promtail** ingest logs (including FastAPI JSON logs).
- **Grafana** available at `http://localhost:3000` (admin/admin).

Trigger a Falco alert by, for example, writing under `/etc` inside a container (per the demo rule).

**Acceptance:** Falco logs a rule hit; FastAPI logs JSON lines with `request_id`, `user_id`, etc., visible in Grafana via Loki datasource.

---

### Container hardening (I)

- FastAPI image built from `python:3.11-slim` with a non-root user `primus`.
- `docker-compose.yml` sets `read_only: true` for the app container.

Build and run:

```bash
docker build -t primus/fastapi-security-demo:latest fastapi
docker run --rm -p 8000:8000 --read-only primus/fastapi-security-demo:latest
```

Inside the container, verify `id` shows a non-root UID and writes to `/` fail.

See `security/container-hardening.md` for a detailed checklist.

---

### Pentest automation script (K)

From the repo root:

```bash
cd security
./run_scan.sh primus.example.com
```

This runs:

- `nmap -sV`
- `gobuster dir`
- `nikto`

and writes outputs into `security-scans/`.

---

### Branch and repo setup

- Create a branch `security/oss-baseline` and push all files there.
- Enable branch protection (require signed commits, CI pass, and PR review) as outlined in `security/supply-chain.md`.

