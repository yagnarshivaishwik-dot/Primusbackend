import json


def test_shop_purchase_emits_ws_events(monkeypatch, client, regular_user, user_token):
    events = []

    async def fake_broadcast_admin(payload: str):
        events.append(("admin", json.loads(payload)))

    async def fake_notify_pc(pc_id: int, payload: str):
        events.append((f"pc-{pc_id}", json.loads(payload)))

    # Patch websocket helpers
    monkeypatch.setattr("app.ws.admin.broadcast_admin", fake_broadcast_admin)
    monkeypatch.setattr("app.ws.pc.notify_pc", fake_notify_pc)

    # Perform purchase as regular user
    headers = {"Authorization": f"Bearer {user_token}"}
    resp = client.post(
        "/api/v1/shop/purchase",
        json={
            "client_id": 1,
            "user_id": regular_user.id,
            "pack_id": "pack1",
            "payment_method": "wallet",
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "completed"
    assert data["minutes_added"] == 60
    assert "purchase_id" in data

    # Ensure both shop.purchase and pc.time.update were emitted
    event_names = [e[1].get("event") for e in events]
    assert "shop.purchase" in event_names
    assert "pc.time.update" in event_names
