"""Mobile-facing WebSocket endpoints.

Exposes read-only real-time status streams for the mobile app:
  - GET /ws/mobile/pc/{pc_id}   → live status of a single PC
  - GET /ws/mobile/cafe/{cafe_id} → live status of all PCs in a cafe

Authentication: First message must be {"event":"auth","payload":{"token":"<JWT>"}}.

Internally subscribes to Redis pub/sub channels:
  - channel:pc:{pc_id}      published by ws/pc.py and session endpoints
  - channel:cafe:{cafe_id}  fan-out from per-PC channels (best-effort)

Falls back to polling the DB every N seconds if Redis is unavailable.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, UTC

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.global_db import global_session_factory as SessionLocal
from app.ws.auth import WSAuthError, authenticate_ws_token, build_event

router = APIRouter()


# --------------------------------------------------------------------------
# Redis pub/sub helper
# --------------------------------------------------------------------------

_redis = None


async def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as aioredis
        from app import config as _config
        _redis = aioredis.from_url(
            getattr(_config, "REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
        return _redis
    except Exception:
        return None


async def publish_pc_status(pc_id: int, payload: dict, cafe_id: int | None = None):
    """Helper to publish a PC status update.

    Called from session/booking endpoints whenever a PC's effective status
    changes (occupied/available/maintenance). Mobile clients subscribed to
    /ws/mobile/pc/{id} or /ws/mobile/cafe/{cafe_id} receive the update.
    """
    redis = await _get_redis()
    if redis is None:
        return
    msg = json.dumps({"pc_id": pc_id, **payload})
    try:
        await redis.publish(f"channel:pc:{pc_id}", msg)
        if cafe_id is not None:
            await redis.publish(f"channel:cafe:{cafe_id}", msg)
    except Exception:
        pass


# --------------------------------------------------------------------------
# Auth helper
# --------------------------------------------------------------------------

async def _authenticate(websocket: WebSocket) -> tuple[int, int | None]:
    """Wait for first auth message, return (user_id, cafe_id).

    Raises WSAuthError on failure.
    """
    raw = await websocket.receive_text()
    msg = json.loads(raw)
    if msg.get("event") != "auth":
        raise WSAuthError("First message must be auth")
    token = (msg.get("payload") or {}).get("token") or ""
    auth_result = authenticate_ws_token(token)
    user = auth_result.user
    return (user.id, auth_result.cafe_id)


# --------------------------------------------------------------------------
# /ws/mobile/pc/{pc_id} — single PC status
# --------------------------------------------------------------------------

@router.websocket("/ws/mobile/pc/{pc_id}")
async def ws_mobile_pc(websocket: WebSocket, pc_id: int):
    """Stream live status of a single PC to a mobile client."""
    await websocket.accept()

    try:
        await _authenticate(websocket)
    except (WSAuthError, json.JSONDecodeError):
        try:
            await websocket.send_text(
                json.dumps(build_event("auth.error", {"reason": "unauthorized"}))
            )
        finally:
            await websocket.close(code=1008)
        return

    # Send initial snapshot from DB
    try:
        snapshot = await asyncio.to_thread(_get_pc_snapshot, pc_id)
        if snapshot:
            await websocket.send_text(
                json.dumps(build_event("pc.status", snapshot))
            )
    except Exception:
        pass

    redis = await _get_redis()
    if redis is None:
        # Polling fallback — send snapshot every 10s
        await _polling_loop_pc(websocket, pc_id)
        return

    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(f"channel:pc:{pc_id}")

        async def _heartbeat():
            while True:
                await asyncio.sleep(25)
                try:
                    await websocket.send_text(json.dumps(build_event("ping", {})))
                except Exception:
                    break

        hb_task = asyncio.create_task(_heartbeat())

        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message.get("data") or "{}")
                except Exception:
                    payload = {}
                await websocket.send_text(
                    json.dumps(build_event("pc.status", payload))
                )
        finally:
            hb_task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await pubsub.unsubscribe(f"channel:pc:{pc_id}")
            await pubsub.close()
        except Exception:
            pass


# --------------------------------------------------------------------------
# /ws/mobile/cafe/{cafe_id} — all PCs in a cafe
# --------------------------------------------------------------------------

@router.websocket("/ws/mobile/cafe/{cafe_id}")
async def ws_mobile_cafe(websocket: WebSocket, cafe_id: int):
    """Stream live status of every PC in a cafe."""
    await websocket.accept()

    try:
        await _authenticate(websocket)
    except (WSAuthError, json.JSONDecodeError):
        try:
            await websocket.send_text(
                json.dumps(build_event("auth.error", {"reason": "unauthorized"}))
            )
        finally:
            await websocket.close(code=1008)
        return

    # Initial snapshot of all PCs in the cafe
    try:
        pcs = await asyncio.to_thread(_get_cafe_snapshot, cafe_id)
        await websocket.send_text(
            json.dumps(build_event("cafe.snapshot", {"cafe_id": cafe_id, "pcs": pcs}))
        )
    except Exception:
        pass

    redis = await _get_redis()
    if redis is None:
        await _polling_loop_cafe(websocket, cafe_id)
        return

    pubsub = redis.pubsub()
    try:
        await pubsub.subscribe(f"channel:cafe:{cafe_id}")

        async def _heartbeat():
            while True:
                await asyncio.sleep(25)
                try:
                    await websocket.send_text(json.dumps(build_event("ping", {})))
                except Exception:
                    break

        hb_task = asyncio.create_task(_heartbeat())

        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message.get("data") or "{}")
                except Exception:
                    payload = {}
                await websocket.send_text(
                    json.dumps(build_event("pc.update", payload))
                )
        finally:
            hb_task.cancel()

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await pubsub.unsubscribe(f"channel:cafe:{cafe_id}")
            await pubsub.close()
        except Exception:
            pass


# --------------------------------------------------------------------------
# DB snapshot helpers (sync; called via asyncio.to_thread)
# --------------------------------------------------------------------------

def _get_pc_snapshot(pc_id: int) -> dict | None:
    """Fetch current PC status from DB."""
    try:
        from app.models import ClientPC  # global table
        db = SessionLocal()
        try:
            pc = db.query(ClientPC).filter_by(id=pc_id).first()
            if not pc:
                return None
            return {
                "pc_id": pc.id,
                "name": pc.name,
                "status": pc.status,
                "last_seen": pc.last_seen.isoformat() if pc.last_seen else None,
            }
        finally:
            db.close()
    except Exception:
        return None


def _get_cafe_snapshot(cafe_id: int) -> list[dict]:
    """Fetch all PCs in a cafe from DB."""
    try:
        from app.models import ClientPC
        db = SessionLocal()
        try:
            pcs = db.query(ClientPC).filter_by(cafe_id=cafe_id).all()
            return [
                {
                    "pc_id": pc.id,
                    "name": pc.name,
                    "status": pc.status,
                    "last_seen": pc.last_seen.isoformat() if pc.last_seen else None,
                }
                for pc in pcs
            ]
        finally:
            db.close()
    except Exception:
        return []


async def _polling_loop_pc(websocket: WebSocket, pc_id: int):
    """Fallback when Redis is unavailable — poll DB every 10 s."""
    last_payload: dict | None = None
    try:
        while True:
            await asyncio.sleep(10)
            snap = await asyncio.to_thread(_get_pc_snapshot, pc_id)
            if snap and snap != last_payload:
                last_payload = snap
                await websocket.send_text(json.dumps(build_event("pc.status", snap)))
    except (WebSocketDisconnect, Exception):
        pass


async def _polling_loop_cafe(websocket: WebSocket, cafe_id: int):
    last_payload: list[dict] | None = None
    try:
        while True:
            await asyncio.sleep(15)
            snap = await asyncio.to_thread(_get_cafe_snapshot, cafe_id)
            if snap != last_payload:
                last_payload = snap
                await websocket.send_text(
                    json.dumps(build_event("cafe.snapshot", {"cafe_id": cafe_id, "pcs": snap}))
                )
    except (WebSocketDisconnect, Exception):
        pass
