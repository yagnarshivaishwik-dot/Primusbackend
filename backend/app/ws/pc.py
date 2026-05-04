import asyncio
import ipaddress
import json
import time
import hmac
import hashlib
from datetime import datetime, UTC

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.global_db import global_session_factory as SessionLocal
from app.db.dependencies import MULTI_DB_ENABLED
from app.db.router import cafe_db_router
from app.ws.admin import broadcast_admin
from app.ws.auth import WSAuthError, authenticate_ws_token, build_event
from app.utils.cache import publish_invalidation
from app.utils.presence import mark_ws_alive, mark_ws_dead

# Pick the right ClientPC / SystemEvent model class for the DB mode at module
# load time. In multi-DB mode the per-cafe schema has no cafe_id column (each
# DB IS a cafe), so we use the cafe-scoped models. In single-DB mode the
# legacy global schema with cafe_id columns is correct. ``User`` always lives
# in the global DB, so it's imported unconditionally from app.models.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import ClientPC, SystemEvent
    from app.models import User
else:
    from app.models import ClientPC, SystemEvent, User  # type: ignore[no-redef]

router = APIRouter()

_pc_connections: dict[int, list[WebSocket]] = {}


def _resolve_cafe_id_from_license(license_key: str) -> int | None:
    """Look up cafe_id for a license_key from the global DB. Returns None on miss."""
    if not license_key:
        return None
    try:
        from app.models import License  # legacy global model — License always lives globally
        gdb = SessionLocal()
        try:
            lic = gdb.query(License).filter_by(key=license_key).first()
            if lic and lic.cafe_id is not None:
                return int(lic.cafe_id)
        finally:
            gdb.close()
    except Exception:
        pass
    return None


def _open_pc_session(license_key: str | None):
    """
    Open a SQLAlchemy session pointed at the database that holds this PC's row.

    In multi-DB mode the WS endpoint only knows pc_id — but pc_id is per-cafe,
    so we MUST resolve cafe_id first (via the License table in the global DB)
    and then open a session against ``primus_cafe_<cafe_id>`` / similar. The
    kiosk includes its license_key in the device_auth payload (and in the
    URL query string as a fallback) for exactly this reason.

    In single-DB mode there's only one DB, so we just return the global session.
    Returns ``(session, cafe_id)``. ``cafe_id`` is None in single-DB mode.
    """
    if not MULTI_DB_ENABLED:
        return SessionLocal(), None
    cafe_id = _resolve_cafe_id_from_license(license_key) if license_key else None
    if cafe_id is None:
        # No license_key means we can't route to the cafe DB. Fall back to
        # the global session so the caller can still raise a clean
        # WSAuthError, but the lookup will return None.
        return SessionLocal(), None
    return cafe_db_router.get_session(cafe_id), cafe_id


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

        # Multi-DB routing: PC records live in per-cafe databases under
        # MULTI_DB_ENABLED, so we need the license_key (kiosk → cafe mapping)
        # to know which DB to query. The kiosk sends license_key in two places
        # for redundancy: (1) the device_auth payload, and (2) the URL query
        # string. The auth flow pulls from payload; the URL fallback covers
        # the JWT "auth" path used by browser admins (also rare on this WS).
        envelope_payload = msg.get("payload") or {}
        license_key = envelope_payload.get("license_key")
        if not license_key:
            license_key = websocket.query_params.get("license_key")

        db, cafe_db_id = _open_pc_session(license_key)
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

                # Phase 2 (audit BE-C3): the previous version only enforced
                # cafe match when BOTH pc.cafe_id AND auth_result.cafe_id were
                # truthy. A malformed JWT with a NULL/missing cafe_id (or a
                # legacy user record without one) bypassed the check entirely.
                # Fail-closed now: superadmin is allowed across cafes; every
                # other caller MUST have a cafe_id and it MUST match the PC.
                pc_cafe = getattr(pc, "cafe_id", None)
                token_cafe = auth_result.cafe_id
                role = getattr(auth_result, "role", "") or ""
                is_superadmin = role.lower() == "superadmin"

                if not is_superadmin:
                    if token_cafe is None:
                        raise WSAuthError("Token has no cafe_id; cannot bind PC")
                    if pc_cafe is None:
                        raise WSAuthError("PC has no cafe_id assignment")
                    if pc_cafe != token_cafe:
                        raise WSAuthError("PC not in caller's cafe")

                # Update PC status on JWT reconnection
                prev_status = pc.status
                pc.status = "online"
                pc.last_seen = datetime.now(UTC)
                db.commit()

                if prev_status != "online":
                    # Cafe-scoped SystemEvent has no cafe_id column in
                    # multi-DB mode (the DB itself IS the cafe). Only attach
                    # cafe_id when the column exists (single-DB legacy schema).
                    _evt_kwargs = dict(
                        type="pc.status",
                        pc_id=pc.id,
                        payload={"status": "online", "reason": "ws_reconnect"},
                    )
                    if not MULTI_DB_ENABLED and getattr(pc, "cafe_id", None) is not None:
                        _evt_kwargs["cafe_id"] = pc.cafe_id
                    db.add(SystemEvent(**_evt_kwargs))
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
                    _evt_kwargs = dict(
                        type="pc.status",
                        pc_id=pc.id,
                        payload={"status": "online", "reason": "ws_reconnect"},
                    )
                    if not MULTI_DB_ENABLED and getattr(pc, "cafe_id", None) is not None:
                        _evt_kwargs["cafe_id"] = pc.cafe_id
                    db.add(SystemEvent(**_evt_kwargs))
                    db.commit()
                    status_changed = True

            pc_hostname = pc.name
            # In multi-DB mode the cafe-scoped ClientPC has no cafe_id column;
            # use the cafe_id we resolved from the license_key when opening
            # the session. In single-DB mode pc.cafe_id is the source of truth.
            pc_cafe_id = getattr(pc, "cafe_id", None) or cafe_db_id
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
                    # Heartbeat must hit the SAME DB the auth handler picked
                    # — for multi-DB that's the per-cafe DB resolved from
                    # license_key. Use _open_pc_session with the license_key
                    # captured at auth time (in scope via closure-ish var).
                    db_hb, _ = _open_pc_session(license_key)
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
                                if not MULTI_DB_ENABLED and getattr(pc_obj, "cafe_id", None) is not None:
                                    _flip_kwargs["cafe_id"] = pc_obj.cafe_id
                                db_hb.add(SystemEvent(**_flip_kwargs))
                            db_hb.commit()

                            if pc_obj.current_user_id:
                                # User table lives in the global DB, not the
                                # cafe DB. Open a global session for the lookup.
                                gdb = SessionLocal()
                                try:
                                    user_obj = (
                                        gdb.query(User).filter_by(id=pc_obj.current_user_id).first()
                                    )
                                    if user_obj:
                                        user_name = (
                                            getattr(user_obj, "name", None)
                                            or f"{getattr(user_obj, 'first_name', '')} {getattr(user_obj, 'last_name', '')}".strip()
                                            or getattr(user_obj, "email", "")
                                        )
                                finally:
                                    gdb.close()
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

        # No connections remain — mark PC offline.
        # Use the same per-cafe DB the auth handler resolved; falling back to
        # global session in single-DB mode. ``license_key`` is in scope from
        # the outer try-block where we read it from the auth envelope.
        try:
            db, _ = _open_pc_session(license_key)
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
