from fastapi import APIRouter, WebSocket, WebSocketDisconnect

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
    await websocket.accept()
    _admin_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        try:
            _admin_connections.remove(websocket)
        except Exception:
            pass
