import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.auth import WSAuthError, authenticate_ws_token, build_event

router = APIRouter()

_admin_connections: list[WebSocket] = []


async def broadcast_admin(payload: str):
    living: list[WebSocket] = []
    for ws in _admin_connections:
        try:
            await ws.send_text(payload)
            living.append(ws)
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
    _admin_connections[:] = living


@router.websocket("/ws/admin")
async def ws_admin(websocket: WebSocket):
    """
    WebSocket endpoint for admin dashboards.

    The first message must be an auth envelope:
        {"event": "auth", "payload": {"token": "<JWT>"}, "ts": ...}
    """
    await websocket.accept()

    # Authenticate first message
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
        if msg.get("event") != "auth":
            raise WSAuthError("First message must be auth")
        token = (msg.get("payload") or {}).get("token") or ""
        user = authenticate_ws_token(token)
        # Only staff/admin-like roles should use admin websocket
        if getattr(user, "role", None) not in ("admin", "owner", "superadmin", "staff"):
            raise WSAuthError("Insufficient role for admin websocket")
    except WebSocketDisconnect:
        # Client disconnected before completing auth; just exit without logging a server error.
        return
    except (WSAuthError, json.JSONDecodeError):
        try:
            await websocket.send_text(
                json.dumps(
                    build_event(
                        "auth.error",
                        {"reason": "unauthorized"},
                    )
                )
            )
        finally:
            await websocket.close(code=1008)
        return

    _admin_connections.append(websocket)

    try:
        while True:
            # Currently we don't expect admin → backend messages other than auth,
            # but we keep the loop to allow future events (acks, filters, etc.).
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        try:
            _admin_connections.remove(websocket)
        except Exception:
            pass
