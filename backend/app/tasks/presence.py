import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ClientPC, SystemEvent

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

                if stale_pcs:
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in presence monitor: {e}")

        await asyncio.sleep(15)  # Run every 15s
