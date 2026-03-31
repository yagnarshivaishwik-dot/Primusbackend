"""
Background task for broadcasting time-left warnings to connected PCs.
Moved from main.py to improve maintainability.
"""

import asyncio
import json
from datetime import datetime

from app.db.global_db import global_session_factory as SessionLocal
from app.models import ClientPC, PCToGroup, PricingRule, User, UserGroup, UserOffer
from app.ws import pc as ws_pc

_last_time_warn: dict[int, int] = {}


def _compute_minutes_for_pc(db, pc_id: int) -> int:
    """
    Compute remaining minutes for a PC based on wallet balance and offers.

    Args:
        db: Database session
        pc_id: PC ID to compute minutes for

    Returns:
        Remaining minutes (0 if no balance or user)
    """
    # Map to pricing rule
    group_map = db.query(PCToGroup).filter_by(pc_id=pc_id).first()
    group_id = group_map.group_id if group_map else None
    now = datetime.utcnow()
    rule = (
        db.query(PricingRule)
        .filter(
            PricingRule.is_active.is_(True),
            (PricingRule.group_id == group_id) | (PricingRule.group_id.is_(None)),
            (PricingRule.start_time.is_(None)) | (PricingRule.start_time <= now),
            (PricingRule.end_time.is_(None)) | (PricingRule.end_time >= now),
        )
        .order_by(PricingRule.group_id.desc())
        .first()
    )
    if not rule:
        return 0
    cpc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not cpc or not cpc.current_user_id:
        return 0
    user = db.query(User).filter_by(id=cpc.current_user_id).first()
    if not user:
        return 0
    rate = rule.rate_per_hour
    if getattr(user, "user_group_id", None):
        ug = db.query(UserGroup).filter_by(id=user.user_group_id).first()
        if ug and ug.discount_percent:
            rate = rate * max(0.0, (100.0 - ug.discount_percent)) / 100.0
    offers = db.query(UserOffer).filter_by(user_id=user.id).all()
    offer_hours = sum(max(0.0, uo.hours_remaining or 0.0) for uo in offers)
    wallet_hours = 0.0
    if rate and rate > 0:
        wallet_hours = max(0.0, (user.wallet_balance or 0.0) / rate)
    total_minutes = int(round((offer_hours + wallet_hours) * 60))
    return total_minutes


async def _broadcast_timeleft_loop():
    """
    Background task loop that periodically broadcasts time-left warnings to PCs.

    Sends warnings at 5 minutes and 1 minute remaining.
    Runs every 30 seconds to check PC status.
    """
    while True:
        try:
            db = SessionLocal()
            try:
                # For each online client PC, compute remaining time
                pcs = db.query(ClientPC).all()
                for pc in pcs:
                    minutes = 0
                    try:
                        minutes = _compute_minutes_for_pc(db, pc.id)
                    except Exception:
                        minutes = 0
                    last = _last_time_warn.get(pc.id)
                    # 5-minute warning
                    if minutes == 5 and last != 5:
                        try:
                            await ws_pc.notify_pc(
                                pc.id, json.dumps({"type": "timeleft", "minutes": 5})
                            )
                        except Exception:
                            pass
                        _last_time_warn[pc.id] = 5
                    # 1-minute final warning
                    elif minutes == 1 and last != 1:
                        try:
                            await ws_pc.notify_pc(
                                pc.id, json.dumps({"type": "timeleft", "minutes": 1})
                            )
                        except Exception:
                            pass
                        _last_time_warn[pc.id] = 1
                    # Time up: lock once
                    elif minutes <= 0 and last != 0:
                        try:
                            await ws_pc.notify_pc(
                                pc.id, json.dumps({"type": "timeleft", "minutes": 0})
                            )
                            await ws_pc.notify_pc(pc.id, json.dumps({"command": "lock"}))
                        except Exception:
                            pass
                        _last_time_warn[pc.id] = 0
                    # Reset tracker if topped up beyond 5
                    elif minutes > 5 and last in (0, 1, 5):
                        _last_time_warn[pc.id] = None
            finally:
                db.close()
        except Exception as e:
            # Log error but continue loop
            import logging

            logging.error(f"Error in timeleft broadcast loop: {e}")
        await asyncio.sleep(60)  # Check every 60 seconds
