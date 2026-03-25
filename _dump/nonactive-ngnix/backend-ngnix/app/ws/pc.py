import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
    await websocket.accept()
    _pc_connections.setdefault(pc_id, []).append(websocket)
    try:
        while True:
            # Keep the connection alive; client may send pings/keepalives
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        try:
            _pc_connections[pc_id].remove(websocket)
        except Exception:
            pass
