import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.auth import WSAuthError, authenticate_ws_token, build_event

router = APIRouter()

_admin_connections: dict[int, list[WebSocket]] = {}  # keyed by cafe_id
_superadmin_connections: list[WebSocket] = []


async def broadcast_admin(payload: str, cafe_id: int):
    """
    Broadcast a message to all admin WebSockets scoped to a specific cafe,
    plus all superadmin connections (which see everything).
    """
    # Send to cafe-scoped admins
    cafe_conns = _admin_connections.get(cafe_id, [])
    living: list[WebSocket] = []
    for ws in cafe_conns:
        try:
            await ws.send_text(payload)
            living.append(ws)
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
    _admin_connections[cafe_id] = living

    # Send to all superadmins
    living_super: list[WebSocket] = []
    for ws in _superadmin_connections:
        try:
            await ws.send_text(payload)
            living_super.append(ws)
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
    _superadmin_connections[:] = living_super


@router.websocket("/ws/admin")
async def ws_admin(websocket: WebSocket):
    """
    WebSocket endpoint for admin dashboards.

    The first message must be an auth envelope:
        {"event": "auth", "payload": {"token": "<JWT>"}, "ts": ...}
    """
    await websocket.accept()

    # Authenticate first message
    auth_result = None
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
        if msg.get("event") != "auth":
            raise WSAuthError("First message must be auth")
        token = (msg.get("payload") or {}).get("token") or ""
        auth_result = authenticate_ws_token(token)
        # Only staff/admin-like roles should use admin websocket
        if auth_result.role not in ("admin", "owner", "superadmin", "staff"):
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

    # Route connection based on role
    is_superadmin = auth_result.role == "superadmin"
    cafe_id = auth_result.cafe_id

    if is_superadmin:
        _superadmin_connections.append(websocket)
    else:
        if cafe_id is not None:
            _admin_connections.setdefault(cafe_id, []).append(websocket)
        else:
            # No cafe_id available — treat as superadmin-level (sees everything)
            _superadmin_connections.append(websocket)

    try:
        while True:
            # Currently we don't expect admin -> backend messages other than auth,
            # but we keep the loop to allow future events (acks, filters, etc.).
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        # Clean up from whichever list the connection was added to
        if is_superadmin or cafe_id is None:
            try:
                _superadmin_connections.remove(websocket)
            except ValueError:
                pass
        else:
            try:
                conns = _admin_connections.get(cafe_id, [])
                conns.remove(websocket)
            except ValueError:
                pass
