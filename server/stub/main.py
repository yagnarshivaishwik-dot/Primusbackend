from __future__ import annotations

import asyncio
import datetime as dt
from typing import Dict, Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Primus Kiosk Stub")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClientRegistrationRequest(BaseModel):
    provisioning_token: str


class HeartbeatRequest(BaseModel):
    available_time: int | None = None
    current_user: str | None = None
    uptime_seconds: int | None = None


class CommandRequest(BaseModel):
    type: str
    args: Dict[str, Any] | None = None


class PurchaseRequest(BaseModel):
    client_id: str
    package_id: int
    amount: float
    offline: bool = False


class ChatMessageRequest(BaseModel):
    client_id: str
    from_client: bool
    text: str


clients: Dict[str, Dict[str, Any]] = {}
client_connections: Dict[str, WebSocket] = {}
shop_items: List[Dict[str, Any]] = [
    {"id": 1, "name": "30 minutes", "description": "30 minutes of game time", "category": "time"},
    {"id": 2, "name": "1 hour", "description": "1 hour of game time", "category": "time"},
]
purchases: List[Dict[str, Any]] = []
chat_messages: List[Dict[str, Any]] = []


@app.post("/api/v1/clients/register")
async def register_client(body: ClientRegistrationRequest):
    # Simple stub: any provisioning token is accepted and assigned an ID
    client_id = f"client-{len(clients) + 1}"
    clients[client_id] = {
        "client_id": client_id,
        "registered_at": dt.datetime.utcnow(),
        "last_heartbeat": None,
        "online": False,
    }
    return {"client_id": client_id}


@app.post("/api/v1/clients/{client_id}/heartbeat")
async def heartbeat(client_id: str, body: HeartbeatRequest):
    if client_id not in clients:
        raise HTTPException(status_code=404, detail="Client not found")
    state = clients[client_id]
    state["last_heartbeat"] = dt.datetime.utcnow()
    state["available_time"] = body.available_time
    state["current_user"] = body.current_user
    state["uptime_seconds"] = body.uptime_seconds
    return {"status": "ok"}


@app.post("/api/v1/clients/{client_id}/command")
async def issue_command(client_id: str, body: CommandRequest):
    if client_id not in clients:
        raise HTTPException(status_code=404, detail="Client not found")

    payload = {
        "type": "CommandIssued",
        "command_id": f"cmd-{dt.datetime.utcnow().timestamp()}",
        "command_type": body.type,
        "args": body.args or {},
    }
    ws = client_connections.get(client_id)
    if ws:
        await ws.send_json(payload)
    return {"status": "queued", "command_id": payload["command_id"]}


@app.post("/api/v1/shop/purchase")
async def purchase(body: PurchaseRequest):
    record = {
        "client_id": body.client_id,
        "package_id": body.package_id,
        "amount": body.amount,
        "offline": body.offline,
        "created_at": dt.datetime.utcnow().isoformat(),
    }
    purchases.append(record)
    return {"status": "ok", "purchase": record}


@app.get("/api/v1/shop")
async def list_shop():
    return shop_items


@app.get("/api/v1/clients")
async def list_clients():
    def _serialize(c: Dict[str, Any]) -> Dict[str, Any]:
        last = c.get("last_heartbeat")
        return {
            "client_id": c["client_id"],
            "online": client_connections.get(c["client_id"]) is not None,
            "last_heartbeat": last.isoformat() if last else None,
            "available_time": c.get("available_time"),
            "current_user": c.get("current_user"),
            "uptime_seconds": c.get("uptime_seconds"),
        }

    return [_serialize(c) for c in clients.values()]


@app.post("/api/v1/chat")
async def send_chat(body: ChatMessageRequest):
    if body.client_id not in clients:
        raise HTTPException(status_code=404, detail="Client not found")

    msg = {
        "client_id": body.client_id,
        "from_client": body.from_client,
        "text": body.text,
        "timestamp": dt.datetime.utcnow().isoformat(),
    }
    chat_messages.append(msg)

    event_type = "ChatMessage" if body.from_client else "AdminReply"
    if not body.from_client:
        # Forward admin reply to client
        ws = client_connections.get(body.client_id)
        if ws:
            await ws.send_json({"type": "AdminReply", "chat_id": len(chat_messages), "text": body.text})
    else:
        # In a real deployment, this would be forwarded to admin dashboards via SignalR / WS.
        pass

    return {"status": "ok"}


@app.get("/api/v1/chat/{client_id}")
async def get_chat_history(client_id: str):
    history = [m for m in chat_messages if m["client_id"] == client_id]
    return history


@app.websocket("/ws/clients/{client_id}")
async def client_ws(websocket: WebSocket, client_id: str):
    await websocket.accept()
    clients.setdefault(client_id, {"client_id": client_id, "registered_at": dt.datetime.utcnow()})
    clients[client_id]["online"] = True
    client_connections[client_id] = websocket

    try:
        while True:
            data = await websocket.receive_json()
            # Client->server events: ClientAck, ChatMessage, Heartbeat
            event_type = data.get("type")
            payload = data.get("payload") or {}

            if event_type == "Heartbeat":
                clients[client_id]["last_heartbeat"] = dt.datetime.utcnow()
                clients[client_id]["available_time"] = payload.get("available_time")
                clients[client_id]["current_user"] = payload.get("current_user")
                clients[client_id]["uptime_seconds"] = payload.get("uptime")
            elif event_type == "ChatMessage":
                chat_messages.append(
                    {
                        "client_id": client_id,
                        "from_client": True,
                        "text": payload.get("text"),
                        "timestamp": dt.datetime.utcnow().isoformat(),
                    }
                )
            elif event_type == "ClientAck":
                # In a real deployment, this would update command state in DB
                pass
    except WebSocketDisconnect:
        pass
    finally:
        client_connections.pop(client_id, None)
        if client_id in clients:
            clients[client_id]["online"] = False


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)


