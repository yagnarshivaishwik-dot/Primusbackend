import asyncio
import json
import time
import hmac
import hashlib
from datetime import datetime, UTC

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.models import ClientPC, User
from app.ws.admin import broadcast_admin
from app.ws.auth import WSAuthError, authenticate_ws_token, build_event
from app.utils.cache import publish_invalidation

router = APIRouter()

_pc_connections: dict[int, list[WebSocket]] = {}


async def notify_pc(pc_id: int, payload: str):
    conns = _pc_connections.get(pc_id, [])
    living: list[WebSocket] = []
    for ws in conns:
        try:
            await ws.send_text(payload)
            living.append(ws)
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
    _pc_connections[pc_id] = living


async def broadcast(payload: str):
    # Send to all connected PCs
    tasks = []
    for pc_id in list(_pc_connections.keys()):
        tasks.append(notify_pc(pc_id, payload))
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


@router.websocket("/ws/pc/{pc_id}")
async def ws_pc(websocket: WebSocket, pc_id: int):
    """
    WebSocket endpoint for Primus client PCs.

    The first message must be an auth envelope:
        {"event": "auth", "payload": {"token": "<JWT>"}, "ts": ...}

    Subsequent messages use the standard event envelope:
        {"event": "<name>", "payload": {...}, "ts": ...}
    """
    await websocket.accept()

    # Authenticate first message
    try:
        raw = await websocket.receive_text()
        msg = json.loads(raw)
        if msg.get("event") not in ("auth", "device_auth"):
            raise WSAuthError("First message must be auth or device_auth")

        event_type = msg.get("event")
        db = SessionLocal()
        is_device_auth = False
        try:
            pc = db.query(ClientPC).filter_by(id=pc_id).first()
            if not pc:
                raise WSAuthError("PC not found")

            if event_type == "auth":
                token = (msg.get("payload") or {}).get("token") or ""
                user = authenticate_ws_token(token)
                if getattr(pc, "cafe_id", None) and getattr(user, "cafe_id", None):
                    if pc.cafe_id != user.cafe_id:
                        raise WSAuthError("PC not in same cafe")
            elif event_type == "device_auth":
                payload = msg.get("payload") or {}
                signature = payload.get("signature")
                timestamp = payload.get("timestamp")

                if not signature or not timestamp:
                    raise WSAuthError("Missing signature or timestamp")

                try:
                    ts_int = int(timestamp)
                    now = int(time.time())
                    if abs(now - ts_int) > 300:
                        raise WSAuthError("Timestamp expired")
                except ValueError:
                    raise WSAuthError("Invalid timestamp")

                if not pc.device_secret:
                    raise WSAuthError("PC has no device secret")

                message = f"{timestamp}".encode()
                expected_sig = hmac.new(
                    pc.device_secret.encode(), message, hashlib.sha256
                ).hexdigest()

                if not hmac.compare_digest(signature, expected_sig):
                    raise WSAuthError("Invalid device signature")

                pc.status = "online"
                pc.last_seen = datetime.now(UTC)
                db.commit()
                is_device_auth = True
        finally:
            db.close()

        if is_device_auth:
            try:
                await publish_invalidation({
                    "scope": "client_pc",
                    "items": [{"type": "client_pc_list", "id": "*"}]
                })
            except Exception:
                pass

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

    _pc_connections.setdefault(pc_id, []).append(websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                # Ignore malformed messages
                continue

            event = data.get("event")
            payload = data.get("payload") or {}

            # Heartbeat: surface lightweight status to admins
            if event == "heartbeat":
                # Lookup current user attached to this client PC for user_name
                user_name: str | None = None
                try:
                    db_hb = SessionLocal()
                    try:
                        pc_obj = db_hb.query(ClientPC).filter_by(id=pc_id).first()
                        if pc_obj and pc_obj.current_user_id:
                            user_obj = (
                                db_hb.query(User).filter_by(id=pc_obj.current_user_id).first()
                            )
                            if user_obj:
                                user_name = (
                                    getattr(user_obj, "name", None)
                                    or f"{getattr(user_obj, 'first_name', '')} {getattr(user_obj, 'last_name', '')}".strip()
                                    or getattr(user_obj, "email", "")
                                )
                    finally:
                        db_hb.close()
                except Exception:
                    user_name = None

                if not user_name:
                    user_name = "Guest"

                status_payload = {
                    "client_id": pc_id,
                    "hostname": payload.get("hostname"),
                    "online": True,
                    "last_heartbeat": data.get("ts"),
                    "remaining_time": payload.get("remaining_time"),
                    "user_name": user_name,
                }
                try:
                    await broadcast_admin(
                        json.dumps(build_event("pc.status.update", status_payload))
                    )
                except Exception:
                    pass

            # Time update: client believes remaining time changed
            elif event == "pc.time.update":
                remaining = payload.get("remaining_time_seconds")
                if remaining is None:
                    remaining = payload.get("remaining_time")
                status_payload = {
                    "client_id": pc_id,
                    "remaining_time_seconds": remaining,
                }
                try:
                    await broadcast_admin(json.dumps(build_event("pc.time.update", status_payload)))
                except Exception:
                    pass

            # Command acknowledgement from client
            elif event == "command.ack":
                try:
                    await broadcast_admin(json.dumps(data))
                except Exception:
                    pass

            # Chat message from PC (optional real-time path)
            elif event == "chat.message":
                try:
                    await broadcast_admin(json.dumps(data))
                except Exception:
                    pass

    except WebSocketDisconnect:
        pass
    finally:
        try:
            _pc_connections[pc_id].remove(websocket)
        except Exception:
            pass

        # Broadcast offline on disconnect
        try:
            db = SessionLocal()
            try:
                pc = db.query(ClientPC).filter_by(id=pc_id).first()
                if pc:
                    pc.status = "offline"
                    db.commit()
            finally:
                db.close()

            try:
                await publish_invalidation({
                    "scope": "client_pc",
                    "items": [{"type": "client_pc_list", "id": "*"}]
                })
            except Exception:
                pass

            status_payload = {
                "client_id": pc_id,
                "online": False
            }
            try:
                await broadcast_admin(json.dumps(build_event("pc.status.update", status_payload)))
            except Exception:
                pass
        except Exception:
            pass
