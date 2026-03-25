# Acceptance: Offline Purchase Queue

## Goal

Verify that when the client is offline, purchases are queued locally and replayed when connectivity is restored, resulting in correct time and admin updates.

## Steps

1. **Preconditions**
   - Backend and admin portal are running initially.
   - Client has access to the shop UI and offline queue logic is enabled (local storage or SQLite).

2. **Simulate offline mode**
   - Disable network access for the Tauri client machine (e.g. unplug cable, disable Wi‑Fi, or block the backend host).
   - Confirm that HTTP requests to the backend fail from the client.

3. **Queue purchase while offline**
   - On the client, open the shop and purchase a **1 Hour** pack.
   - Expected:
     - The purchase attempts to call `/api/v1/shop/purchase` (or equivalent) and fails.
     - The offline queue enqueues the request with endpoint, body, and headers.

4. **Restore connectivity**
   - Re‑enable network connectivity.
   - The offline queue worker should flush queued entries, replaying the purchase to the backend.

5. **Verify outcomes**
   - Backend shows a successful purchase record.
   - Admin portal:
     - Receives a `shop.purchase` event for the client.
     - Shows a toast “Client X purchased 1 Hour (+60 min).”
     - Increments `Remaining time` for that PC accordingly.


