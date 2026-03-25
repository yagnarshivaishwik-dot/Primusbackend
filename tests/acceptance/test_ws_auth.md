# Acceptance: WebSocket Authentication (ws/admin)

## Goal

Confirm that the `/ws/admin` endpoint enforces authentication using an admin JWT and rejects unauthenticated or expired tokens.

## Steps

1. **Preconditions**
   - Backend is running.
   - You have valid admin credentials to obtain a JWT via `/api/auth/login`.

2. **Unauthenticated connection**
   - From a WebSocket client (e.g. `wscat`, browser devtools, or a small script), connect to `ws://<backend-host>/ws/admin`.
   - Do **not** send any auth message.
   - Expected: server closes the connection with an authentication error (HTTP 1008 / `auth.error` event).

3. **Expired token**
   - Create or modify a JWT to be expired (e.g. using very small `exp`).
   - Connect to `/ws/admin`, send:
     ```json
     {"event":"auth","payload":{"token":"<expired>"},"ts":1699999999}
     ```
   - Expected: connection is closed with `auth.error`.

4. **Valid token**
   - Log in via `/api/auth/login` to obtain a valid `access_token` for an admin.
   - Open a new WebSocket connection and send:
     ```json
     {"event":"auth","payload":{"token":"<access_token>"},"ts":1699999999}
     ```
   - Expected:
     - Connection remains open.
     - Subsequent `pc.status.update` events are received when clients send heartbeats.


