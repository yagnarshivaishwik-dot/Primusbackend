"""
Seed / normalise shop time-pack prices to ₹5 each.

Intent: user wants every pack in the kiosk shop to start at ₹5 so an admin
can then tune them from the admin website. Idempotent — safe to re-run.
Creates a sensible default pack set if none exist yet.

Run from the backend container:
    docker compose exec backend python -m app.scripts.seed_packs_five_rupees
"""

from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.models import Offer

log = logging.getLogger("seed_packs_five_rupees")
logging.basicConfig(level=logging.INFO, format="%(message)s")

DEFAULT_PACKS = [
    ("15 Minutes", 15),
    ("30 Minutes", 30),
    ("1 Hour", 60),
    ("2 Hours", 120),
    ("4 Hours", 240),
]


def run() -> None:
    db = SessionLocal()
    try:
        existing = db.query(Offer).all()

        if not existing:
            log.info("No offers found — creating %d default packs at ₹5 each.", len(DEFAULT_PACKS))
            for name, minutes in DEFAULT_PACKS:
                db.add(
                    Offer(
                        name=name,
                        description=f"{minutes} minutes of play time",
                        price=5.0,
                        hours_minutes=minutes,
                        active=True,
                    )
                )
            db.commit()
            log.info("Done.")
            return

        touched = 0
        for o in existing:
            if o.price != 5.0 or not o.active:
                o.price = 5.0
                o.active = True
                touched += 1
        db.commit()
        log.info(
            "Normalised %d/%d existing offers to price=₹5 (active=True). "
            "Admin can change any of these from the admin website.",
            touched,
            len(existing),
        )
    finally:
        db.close()


if __name__ == "__main__":
    run()
