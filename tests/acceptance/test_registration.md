# Acceptance: Client Registration

## Goal

Verify that the Tauri Primus client registers successfully with the real backend and appears in the Primus admin portal within 10 seconds.

## Steps

1. **Start backend**
   - From `backend/` run: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`.

2. **Start Primus admin portal**
   - From `primus-admin/` run: `npm install` (first time only), then `npm run dev`.
   - Ensure `VITE_API_BASE_URL` (or `primus_api_base` in localStorage) is set to `http://localhost:8000`.

3. **Configure Tauri client**
   - In `PrimusClient/`, set `VITE_API_BASE_URL=http://localhost:8000` and a valid `VITE_LICENSE_KEY` that matches a license in the backend.

4. **Launch Tauri client**
   - From `PrimusClient/` run: `npm install` (first time only) then `npm run tauri:dev`.

5. **Verify registration**
   - Log into the admin portal with an admin account.
   - Navigate to the **PC list** page.
   - Within 10 seconds of client launch, a new PC entry should appear with:
     - Correct `name` (hostname),
     - Status `online` or `idle`,
     - Recent `last_seen` timestamp.


