# Acceptance: Real-time Shop Purchase

## Goal

Ensure that when a client purchases time, the backend records it and the admin portal reflects the purchase and remaining time in real time.

## Steps

1. **Preconditions**
   - Backend, admin portal, and Tauri client are running.
   - Client is logged in with a user that has sufficient balance or is allowed to purchase time packs.

2. **Initiate purchase on client**
   - From the Tauri client, open the **Shop** page.
   - Purchase a **1 Hour** pack.

3. **Verify backend state**
   - Using backend logs or a database view, confirm that a purchase record is created for the user/PC.

4. **Verify admin real-time event**
   - In the admin portal, remain on **PC list** or the relevant shop/purchases view.
   - On purchase, the backend should emit a `shop.purchase` event, which:
     - Triggers a toast: “Client X purchased 1 Hour (+60 min).”
     - Increments the `Remaining time` for that PC by 60 minutes.

5. **No page refresh**
   - Confirm no manual refresh is needed; UI updates are driven solely by WebSocket events.


