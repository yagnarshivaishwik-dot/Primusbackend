## Primus Kiosk Deployment Guide

### 1. Build & Publish

- From the repository root:
  - Build kiosk client:
    - `cd client`
    - `.\build.ps1 -Configuration Release`
  - Publish single‑file EXE:
    - `.\publish.ps1 -Configuration Release -Runtime win-x64`
  - Output:
    - `client\publish\PrimusKiosk.exe`

### 2. Stub Backend for Local Testing

- Install dependencies:
  - `cd server/stub`
  - `python -m venv .venv && .\.venv\Scripts\activate`
  - `pip install -r requirements.txt`
- Run stub:
  - `python main.py`
  - Exposes:
    - REST: `http://localhost:8001`
    - WebSocket: `ws://localhost:8001/ws/clients/{client_id}`

### 3. Admin Portal Stub

- Open `admin/stub/index.html` in a browser (or serve via `python -m http.server`).
- Configure `API_BASE` in the file if your stub backend is not on `http://localhost:8001`.
- Features:
  - List connected clients, heartbeat times, and status.
  - Issue commands (`add_time`, `lock_screen`, etc).
  - Chat with a selected client and view history.

### 4. Provisioning Flow

1. Generate a one‑time provisioning token in the real Primus admin (or use any string with the stub).
2. Save it as `provisioning_token.txt` alongside `PrimusKiosk.exe` (or adjust `ProvisioningTokenPath` in `client/appsettings.json`).
3. First run of `PrimusKiosk.exe`:
   - Reads provisioning token.
   - Calls `POST /api/v1/clients/register`.
   - Persists `client_id` into `client_id.txt` next to the EXE.
   - Establishes WebSocket to `/ws/clients/{client_id}`.

### 5. Kiosk Lockdown (Windows)

Because full kiosk hardening spans OS configuration, the EXE cooperates with the following Windows features:

- **Assigned Access (Kiosk mode)**:
  - Configure a dedicated kiosk user account.
  - Use Assigned Access / Shell Launcher to launch `PrimusKiosk.exe` at logon and block shell access.
- **Group Policy recommendations**:
  - Disable Task Manager and `Ctrl+Alt+Del` options.
  - Disable access to the Run dialog and command prompts.
  - Prevent access to Control Panel and Settings.
  - Disable Fast User Switching.
  - Configure automatic logon for the kiosk user.
- **BIOS / firmware**:
  - Disable boot from external media.
  - Set BIOS/UEFI password.

The WPF client:

- Runs full‑screen, borderless, and top‑level.
- Intercepts `Alt+F4`, `Alt+Tab`, and Windows key messages where possible, but **cannot** fully prevent OS‑level exceptions; GPO/Assigned Access are required.

### 6. TLS & Certificates

- Production Primus backend must be exposed via HTTPS with a valid certificate.
- The kiosk client:
  - Enforces certificate validation using standard Windows trust.
  - For self‑signed staging:
    - Import the CA/root certificate into the Local Machine “Trusted Root Certification Authorities” store.
    - After that, `curl -Iv https://192.168.29.38:8000` should show TLS OK.
- For the stub (`http://localhost:8001`), TLS is not enabled; it is for development only.

### 7. Unattended Install & AD/GPO Deployment

- Wrap `PrimusKiosk.exe` in:
  - An **MSIX** or MSI package for enterprise deployment (e.g., via MSIX Packaging Tool or WiX).
  - Include:
    - Installation path (e.g., `C:\Program Files\PrimusKiosk`).
    - A shortcut or shell launcher entry for Assigned Access.
    - Optional transform to drop a `provisioning_token.txt` and `appsettings.json` for each kiosk.
- Suggested unattended switches (depending on installer tech):
  - MSI: `msiexec /i PrimusKiosk.msi /qn /norestart`
  - EXE bootstrapper: `PrimusKioskSetup.exe /quiet /norestart /log install.log`
- Deploy via:
  - Group Policy Software Installation.
  - System Center Configuration Manager (SCCM) or Microsoft Intune.


