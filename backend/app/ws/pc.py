import asyncio
import ipaddress
import json
import time
import hmac
import hashlib
from datetime import datetime, UTC

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.global_db import global_session_factory as SessionLocal
from app.models import ClientPC, SystemEvent, User
from app.ws.admin import broadcast_admin
from app.ws.auth import WSAuthError, authenticate_ws_token, build_event
from app.utils.cache import publish_invalidation
from app.utils.presence import mark_ws_alive, mark_ws_dead

router = APIRouter()

_pc_connections: dict[int, list[WebSocket]] = {}


async def notify_pc(pc_id: int, payload: str):
    conns = _pc_connections.get(pc_id, [])
    if not conns:
        print(f"[notify_pc] No active connections for PC #{pc_id} — command will rely on HTTP polling")
        return

    living: list[WebSocket] = []
    for ws in conns:
        try:
            await ws.send_text(payload)
            living.append(ws)
        except Exception as e:
            print(f"[notify_pc] Failed to send to PC #{pc_id}: {e} — removing dead connection")
            try:
                await ws.close()
            except Exception:
                pass
    _pc_connections[pc_id] = living

    if not living:
        print(f"[notify_pc] All connections dead for PC #{pc_id} — command will rely on HTTP polling")


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
        status_changed = False
        pc_hostname = None
        try:
            pc = db.query(ClientPC).filter_by(id=pc_id).first()
            if not pc:
                raise WSAuthError("PC not found")

            if event_type == "auth":
                token = (msg.get("payload") or {}).get("token") or ""
                auth_result = authenticate_ws_token(token)
                user = auth_result.user
                if getattr(pc, "cafe_id", None) and auth_result.cafe_id:
                    if pc.cafe_id != auth_result.cafe_id:
                        raise WSAuthError("PC not in same cafe")

                # Update PC status on JWT reconnection
                prev_status = pc.status
                pc.status = "online"
                pc.last_seen = datetime.now(UTC)
                db.commit()

                if prev_status != "online":
                    event = SystemEvent(
                        type="pc.status",
                        cafe_id=pc.cafe_id,
                        pc_id=pc.id,
                        payload={"status": "online", "reason": "ws_reconnect"},
                    )
                    db.add(event)
                    db.commit()
                    status_changed = True

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

                # Reject devices that are not active (pending/revoked)
                if getattr(pc, "device_status", "active") != "active":
                    raise WSAuthError(
                        f"Device not active (status: {pc.device_status})"
                    )

                # Validate connecting IP against allowed range if configured
                if pc.allowed_ip_range:
                    try:
                        client_host = websocket.client.host if websocket.client else None
                        if client_host:
                            client_ip = ipaddress.ip_address(client_host)
                            allowed_net = ipaddress.ip_network(
                                pc.allowed_ip_range, strict=False
                            )
                            if client_ip not in allowed_net:
                                raise WSAuthError(
                                    f"IP {client_host} not in allowed range {pc.allowed_ip_range}"
                                )
                    except ValueError:
                        # Malformed IP or CIDR — reject to be safe
                        raise WSAuthError("Invalid IP or allowed_ip_range configuration")

                prev_status = pc.status
                pc.status = "online"
                pc.last_seen = datetime.now(UTC)
                db.commit()

                if prev_status != "online":
                    event = SystemEvent(
                        type="pc.status",
                        cafe_id=pc.cafe_id,
                        pc_id=pc.id,
                        payload={"status": "online", "reason": "ws_reconnect"},
                    )
                    db.add(event)
                    db.commit()
                    status_changed = True

            pc_hostname = pc.name
            pc_cafe_id = pc.cafe_id
        finally:
            db.close()

        # Register this WS in the cluster-wide presence set so other workers
        # can see ws_connected=True for this PC. Refreshed on every heartbeat.
        await mark_ws_alive(pc_id)

        # Broadcast status change and invalidate cache (after db is closed)
        if status_changed:
            try:
                await publish_invalidation({
                    "scope": "client_pc",
                    "items": [{"type": "client_pc_list", "id": "*"}]
                })
            except Exception:
                pass

            status_payload = {
                "client_id": pc_id,
                "online": True,
                "hostname": pc_hostname,
            }
            try:
                await broadcast_admin(
                    json.dumps(build_event("pc.status.update", status_payload)),
                    cafe_id=pc_cafe_id,
                )
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

            # Heartbeat: update last_seen and surface status to admins.
            # The C# clutchh kiosk's WebSocket loop ships {event:"ping"} as its
            # keepalive — accept it as an alias so we don't silently drop every
            # heartbeat from the new client (which would mark the PC offline
            # 45s after presence_monitor_loop next runs).
            if event in ("heartbeat", "ping"):
                # Refresh cluster-wide presence TTL so any worker handling an
                # admin /api/clientpc/ request sees this PC as ws_connected.
                await mark_ws_alive(pc_id)

                # Update last_seen so presence_monitor_loop knows this PC is alive.
                # Also lookup current user for admin display. Track whether the
                # status flipped from a "stuck" state (offline/restarting/
                # shutting_down) → online, so we can invalidate the cached
                # /api/clientpc/ list and emit a pc.status SystemEvent. Without
                # this, an admin doing a fresh fetch right after a kiosk reboot
                # gets the cached "restarting" row and the PC appears stuck.
                user_name: str | None = None
                status_flipped_to_online = False
                try:
                    db_hb = SessionLocal()
                    try:
                        pc_obj = db_hb.query(ClientPC).filter_by(id=pc_id).first()
                        if pc_obj:
                            pc_obj.last_seen = datetime.now(UTC)
                            if pc_obj.status != "online":
                                pc_obj.status = "online"
                                status_flipped_to_online = True
                                _flip_kwargs = dict(
                                    type="pc.status",
                                    pc_id=pc_obj.id,
                                    payload={"status": "online", "reason": "heartbeat_recovery"},
                                )
                                if getattr(pc_obj, "cafe_id", None) is not None:
                                    _flip_kwargs["cafe_id"] = pc_obj.cafe_id
                                db_hb.add(SystemEvent(**_flip_kwargs))
                            db_hb.commit()

                            if pc_obj.current_user_id:
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

                # Bust the admin's REST cache so a page reload doesn't resurrect
                # the stale "restarting" / "offline" status the heartbeat just
                # cleared.
                if status_flipped_to_online:
                    try:
                        await publish_invalidation({
                            "scope": "client_pc",
                            "items": [{"type": "client_pc_list", "id": "*"}]
                        })
                    except Exception:
                        pass

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
                        json.dumps(build_event("pc.status.update", status_payload)),
                        cafe_id=pc_cafe_id,
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
                    await broadcast_admin(
                        json.dumps(build_event("pc.time.update", status_payload)),
                        cafe_id=pc_cafe_id,
                    )
                except Exception:
                    pass

            # Command acknowledgement from client
            elif event == "command.ack":
                try:
                    await broadcast_admin(json.dumps(data), cafe_id=pc_cafe_id)
                except Exception:
                    pass

            # Chat message from PC (optional real-time path)
            elif event == "chat.message":
                try:
                    await broadcast_admin(json.dumps(data), cafe_id=pc_cafe_id)
                except Exception:
                    pass

    except WebSocketDisconnect:
        pass
    finally:
        try:
            _pc_connections[pc_id].remove(websocket)
        except Exception:
            pass

        # Only mark offline if NO other connections remain for this PC.
        # This prevents a race condition where a reconnecting client's new
        # WebSocket has already been registered before this finally block runs,
        # which would incorrectly overwrite the "online" status.
        remaining = _pc_connections.get(pc_id, [])
        if remaining:
            return

        # Small grace period to allow fast reconnects to establish
        # before we mark offline and broadcast.
        await asyncio.sleep(2)

        # Re-check after grace period — a new connection may have arrived
        remaining = _pc_connections.get(pc_id, [])
        if remaining:
            return

        # Drop the PC from the cluster-wide WS presence set so other workers
        # stop reporting ws_connected=True. The TTL would catch it eventually,
        # but explicit cleanup avoids the 120s window of stale "online" state.
        await mark_ws_dead(pc_id)

        # No connections remain — mark PC offline
        try:
            db = SessionLocal()
            try:
                pc = db.query(ClientPC).filter_by(id=pc_id).first()
                if pc and pc.status != "offline":
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
                await broadcast_admin(
                    json.dumps(build_event("pc.status.update", status_payload)),
                    cafe_id=pc_cafe_id,
                )
            except Exception:
                pass
        except Exception:
            pass
