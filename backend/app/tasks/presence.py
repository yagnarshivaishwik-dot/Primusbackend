import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.global_db import global_session_factory
from app.db.models_cafe import ClientPC, SystemEvent
from app.db.models_global import Cafe
from app.db.router import cafe_db_router
from app.utils.cache import publish_invalidation
from app.ws.admin import broadcast_admin
from app.ws.auth import build_event
from app.ws.pc import _pc_connections

logger = logging.getLogger("primus.tasks.presence")


async def presence_monitor_loop():
    """
    MASTER SYSTEM: Authoritative presence monitoring.
    Marks PCs OFFLINE if they haven't sent a heartbeat recently.
    Iterates over all provisioned cafe databases.
    """
    logger.info("Presence monitor started")
    while True:
        try:
            # Get all provisioned cafe IDs from global DB
            global_db = global_session_factory()
            try:
                cafe_ids = [
                    c.id for c in global_db.query(Cafe).filter_by(db_provisioned=True).all()
                ]
            finally:
                global_db.close()

            all_stale_info: list[dict] = []

            for cafe_id in cafe_ids:
                cafe_db: Session = cafe_db_router.get_session(cafe_id)
                stale_info: list[dict] = []
                try:
                    threshold = datetime.now(UTC) - timedelta(seconds=45)

                    stale_pcs = (
                        cafe_db.query(ClientPC)
                        .filter(ClientPC.status != "offline", ClientPC.last_seen < threshold)
                        .all()
                    )

                    for pc in stale_pcs:
                        if _pc_connections.get(pc.id):
                            logger.debug(
                                f"PC {pc.id} ({pc.name}) has stale last_seen but active WS — skipping."
                            )
                            continue
                        logger.info(f"PC {pc.id} ({pc.name}) timed out. Marking offline.")
                        pc.status = "offline"

                        event = SystemEvent(
                            type="pc.status",
                            cafe_id=pc.cafe_id,
                            pc_id=pc.id,
                            payload={"status": "offline", "reason": "heartbeat_timeout"},
                        )
                        cafe_db.add(event)

                        stale_info.append({"client_id": pc.id, "hostname": pc.name, "cafe_id": pc.cafe_id})

                    if stale_pcs:
                        cafe_db.commit()

                    all_stale_info.extend(stale_info)
                finally:
                    cafe_db.close()

            # Broadcast offline status to admin dashboards and invalidate cache
            if all_stale_info:
                try:
                    await publish_invalidation({
                        "scope": "client_pc",
                        "items": [{"type": "client_pc_list", "id": "*"}]
                    })
                except Exception:
                    pass

                for info in all_stale_info:
                    try:
                        await broadcast_admin(
                            json.dumps(build_event("pc.status.update", {
                                "client_id": info["client_id"],
                                "online": False,
                                "hostname": info["hostname"],
                            })),
                            cafe_id=info["cafe_id"],
                        )
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"Error in presence monitor: {e}")

        await asyncio.sleep(15)  # Run every 15s
