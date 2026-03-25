# Acceptance: Real-time Chat (Client ↔ Admin)

## Goal

Verify that chat messages between a client PC and the admin are delivered in real time via WebSockets while still being persisted over HTTP.

## Steps

1. **Preconditions**
   - Backend, admin portal, and Tauri client are running.
   - Client is logged in and associated with a PC entry visible in **PC list**.

2. **Client → Admin**
   - From the client, open the chat UI and send a message like “Hello admin”.
   - The client should:
     - POST the message to `/api/chat/` for persistence, and
     - Send a `chat.message` WS event through `/ws/pc/{pc_id}`.

3. **Verify admin reception**
   - In admin, open the chat panel for that PC.
   - Confirm the new message appears within 2 seconds without page refresh.

4. **Admin → Client**
   - In admin, reply “Hello client”.
   - Backend should:
     - Persist via `/api/chat/`, and
     - Push a `chat.message` event to the client PC.

5. **Verify client reception**
   - On the client, confirm the admin reply appears in the chat window in under 2 seconds.


