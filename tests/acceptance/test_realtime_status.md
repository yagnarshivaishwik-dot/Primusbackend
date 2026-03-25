# Acceptance: Real-time PC Status and Time

## Goal

Confirm that PC status and remaining time are updated in real time on the Primus admin portal without page refresh.

## Steps

1. **Preconditions**
   - Backend and admin portal are running (see `test_registration.md`).
   - At least one Tauri client is registered and visible on the **PC list** page.

2. **Observe baseline**
   - In admin **PC list**, locate the client card:
     - Green pulsing dot shows online.
     - `Remaining time` text shows either `N min` or is absent if unknown.

3. **Trigger time update from client**
   - On the Tauri client, start or extend a session so that remaining time increases (e.g., buy a pack or top up).
   - The client should send a `pc.time.update` WebSocket event to the backend.

4. **Verify admin update**
   - In under 10 seconds:
     - The `Remaining time` text on the corresponding PC card updates to the new value.
     - No manual refresh is required.

5. **Lock/unlock behavior**
   - From admin, use the **Lock** button on the PC card.
   - Confirm in the Tauri client that the lock overlay appears immediately.
   - Use **Unlock** and verify the overlay disappears.


