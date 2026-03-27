import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ClientPC, SystemEvent
from app.utils.cache import publish_invalidation
from app.ws.admin import broadcast_admin
from app.ws.auth import build_event
from app.ws.pc import _pc_connections

logger = logging.getLogger("primus.tasks.presence")


async def presence_monitor_loop():
    """
    MASTER SYSTEM: Authoritative presence monitoring.
    Marks PCs OFFLINE if they haven't sent a heartbeat recently.
    """
    logger.info("Presence monitor started")
    while True:
        try:
            db: Session = SessionLocal()
            stale_info: list[dict] = []
            try:
                # Threshold: 45 seconds (allows for 3 missed 15s heartbeats)
                threshold = datetime.now(UTC) - timedelta(seconds=45)

                # Find PCs that were online but are now stale
                stale_pcs = (
                    db.query(ClientPC)
                    .filter(ClientPC.status != "offline", ClientPC.last_seen < threshold)
                    .all()
                )

                for pc in stale_pcs:
                    # Skip PCs that have an active WebSocket connection —
                    # last_seen may be stale if heartbeats are only over WS,
                    # but the connection itself proves the PC is alive.
                    if _pc_connections.get(pc.id):
                        logger.debug(
                            f"PC {pc.id} ({pc.name}) has stale last_seen but active WS — skipping."
                        )
                        continue
                    logger.info(f"PC {pc.id} ({pc.name}) timed out. Marking offline.")
                    pc.status = "offline"

                    # Emit event for Admin UI
                    event = SystemEvent(
                        type="pc.status",
                        cafe_id=pc.cafe_id,
                        pc_id=pc.id,
                        payload={"status": "offline", "reason": "heartbeat_timeout"},
                    )
                    db.add(event)

                    # Capture info for broadcast after commit
                    stale_info.append({"client_id": pc.id, "hostname": pc.name})

                if stale_pcs:
                    db.commit()
            finally:
                db.close()

            # Broadcast offline status to admin dashboards and invalidate cache
            if stale_info:
                try:
                    await publish_invalidation({
                        "scope": "client_pc",
                        "items": [{"type": "client_pc_list", "id": "*"}]
                    })
                except Exception:
                    pass

                for info in stale_info:
                    try:
                        await broadcast_admin(
                            json.dumps(build_event("pc.status.update", {
                                "client_id": info["client_id"],
                                "online": False,
                                "hostname": info["hostname"],
                            }))
                        )
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"Error in presence monitor: {e}")

        await asyncio.sleep(15)  # Run every 15s
