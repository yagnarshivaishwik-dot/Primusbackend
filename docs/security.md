## Primus Kiosk Security Overview

### 1. Authentication & OIDC (Keycloak)

- The kiosk is designed to integrate with Primus’ Keycloak-based OIDC stack:
  - Machine / kiosk provisioning uses a one‑time provisioning token, exchanged for a `client_id` via `POST /api/v1/clients/register`.
  - User logins reuse the existing Primus `/api/auth/login` credentials (username/email + password).
- Future OIDC flows:
  - The WPF client can be extended to use `IdentityModel.OidcClient` or system browser logins for full OIDC flows against Keycloak.
  - Tokens acquired from Keycloak should then be exchanged for Primus backend tokens or used directly depending on backend configuration.

### 2. Local Token Storage

- Access tokens are **never written in plaintext**:
  - Tokens from `/api/auth/login` are encrypted with Windows DPAPI via `ProtectedData` in `DpapiProtector`.
  - Encrypted blobs are stored in `token.dat` next to the EXE.
  - Decryption is tied to the machine context (`DataProtectionScope.LocalMachine`), so tokens are not portable across machines.
- Rotation:
  - Tokens should have appropriate expiry in the backend.
  - On expiry or failure, the client prompts for re‑authentication and overwrites `token.dat` with a new DPAPI‑protected value.

### 3. Transport Security

- All production traffic uses HTTPS / WSS:
  - REST base URL: `https://192.168.29.38:8000`.
  - WebSocket endpoint: `wss://192.168.29.38:8000/ws/clients/{client_id}`.
- Certificate validation:
  - The `HttpClientHandler` in `BackendClient` only accepts certificates that pass normal Windows trust (`SslPolicyErrors.None`).
  - For staging with self‑signed certificates, operators must import the appropriate CA into the Windows trust store; no “ignore all errors” bypass is used.

### 4. Offline Queueing & Replay

- SQLite database:
  - Path: `%PROGRAMDATA%\PrimusKiosk\kiosk.sqlite`.
  - Table `queued_events` stores:
    - `type` (e.g. `ClientAck`, `GameLaunchRequested`, future `Purchase`, `ChatMessage`).
    - `payload` (JSON).
    - `created_utc`, `retry_count`.
- Replay strategy:
  - When the kiosk detects connectivity (`IsConnected = true`), the `OfflineQueueService` drains events in FIFO order.
  - On failure, `retry_count` is incremented, and event remains queued; exponential backoff policies can be added as needed.
  - This supports queued purchases and chat messages when the backend is unavailable.

### 5. Logging & Redaction

- Serilog is used for structured logging:
  - Log location: `%PROGRAMDATA%\PrimusKiosk\logs\kiosk-*.log`.
  - Includes environment and machine metadata but **no secrets**.
- Redaction guidelines:
  - Do **not** log:
    - Raw access tokens, refresh tokens, or provisioning tokens.
    - User passwords or full payment card data.
  - When logging errors from HTTP responses, log only status codes and high‑level messages.
  - The provided code avoids logging request bodies or headers that could include credentials.

### 6. Rate Limiting & Brute-Force Mitigation

- Client-side:
  - The WPF login view model can enforce simple rate‑limiting:
    - Backoff after N failed attempts (e.g., 5 failures => 30‑second cooldown).
    - UI feedback that additional attempts are temporarily blocked.
- Server-side:
  - The real Primus backend (FastAPI + Keycloak) must enforce:
    - IP- and account-based rate limiting for `/api/auth/login`.
    - Account lockout or CAPTCHA after repeated failures.

### 7. Secret Management & Vault

- Client:
  - Any local secrets (API base URL overrides, client credentials if ever used) must be either:
    - Stored in `appsettings.json` without secrets, or
    - Encrypted at rest via DPAPI (`DpapiProtector`) if they must be persisted.
- Server:
  - For production, Primus backend should source sensitive values (database passwords, OIDC client secrets, payment keys) from HashiCorp Vault.
  - Rotations:
    - Use Vault to periodically rotate DB credentials and application secrets.
    - Ensure the kiosk picks up new configuration (e.g., via endpoint that returns updated URLs and public keys).


