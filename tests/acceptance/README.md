## Primus Kiosk Acceptance Flows

These steps use the **stub backend** (`server/stub`) and **admin stub UI** (`admin/stub`) to exercise the main scenarios.

### Prerequisites

- Python 3.10+ with `fastapi` and `uvicorn` (`pip install -r server/stub/requirements.txt`).
- .NET 8 SDK (`dotnet --version`).

### 1. First-run Provisioning

1. Start stub backend:
   - `cd server/stub`
   - `python main.py`
2. Build & publish kiosk:
   - `cd client`
   - `.\publish.ps1`
3. Create `provisioning_token.txt` next to `PrimusKiosk.exe` with any value.
4. Run `client\publish\PrimusKiosk.exe`.
5. Within ~15s:
   - Open `admin/stub/index.html` in a browser.
   - Click **Refresh**.
   - The new kiosk should appear under **Connected PCs**.

### 2. add_time Command

1. In admin stub, select the kiosk under **Target Client**.
2. Choose command `add_time`.
3. Set args JSON to `{"minutes": 30}` and click **Send Command**.
4. Verify:
   - The kiosk remains unlocked.
   - Logs show a `CommandIssued` event and a `ClientAck` for `add_time`.

### 3. lock_screen / unlock

1. In admin stub:
   - Command: `lock_screen`.
   - Args: `{"message": "Maintenance"}`.
2. Verify on kiosk:
   - Full-screen lock overlay appears with the provided message.
3. Then send `unlock` command.
4. Verify:
   - Overlay disappears and user can interact again.

### 4. Chat Flow

1. With kiosk running and connected:
   - In the admin stub, select the client.
   - Send a chat message via the **Chat** area.
2. Verify:
   - Stub backend `/api/v1/chat/{client_id}` shows the new message.
   - Future UI enhancements in the kiosk can subscribe and render `AdminReply` events.

### 5. Offline Purchase Queue

1. Stop the stub backend (`Ctrl+C`).
2. From the kiosk (future UI) or via test harness, queue a purchase event:
   - The `OfflineQueueService` will write a `Purchase` event into SQLite.
3. Restart stub backend.
4. Within ~10 seconds, the queue processor replays events:
   - Check that `purchases` are visible via `GET /api/v1/shop` or a dedicated endpoint.

### 6. TLS Validation (Real Backend)

1. Against the real Primus backend:
   - Ensure the certificate is installed and trusted on the kiosk.
2. From the kiosk machine:
   - `curl -Iv https://192.168.29.38:8000`
   - Confirm that TLS negotiation completes without errors.


