"""
Audit logging utility for the Primus system.
Provides helper functions to record system events for compliance and debugging.
"""
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import SystemEvent


def log_event(
    db: Session,
    event_type: str,
    payload: dict,
    cafe_id: int | None = None,
    pc_id: int | None = None,
    user_id: int | None = None,
):
    """
    Log a system event to the database.

    Event types:
    - user.login
    - user.logout
    - user.register
    - session.start
    - session.stop
    - order.created
    - order.confirmed
    - payment.received
    - pc.registered
    - pc.heartbeat
    - pc.status_changed
    - command.sent
    - command.acknowledged
    - shop.purchase
    - admin.action
    """
    event = SystemEvent(
        type=event_type,
        cafe_id=cafe_id,
        pc_id=pc_id,
        payload={
            **payload,
            "user_id": user_id,
            "timestamp": datetime.now(UTC).isoformat(),
        },
        timestamp=datetime.now(UTC),
    )
    db.add(event)
    # Don't commit here - let the caller handle transaction
    return event


# Convenience functions for common event types

def log_user_login(db: Session, user_id: int, cafe_id: int | None = None, pc_id: int | None = None, details: dict = None):
    """Log a user login event."""
    return log_event(db, "user.login", details or {}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)


def log_user_logout(db: Session, user_id: int, cafe_id: int | None = None, pc_id: int | None = None, details: dict = None):
    """Log a user logout event."""
    return log_event(db, "user.logout", details or {}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)


def log_session_start(db: Session, session_id: int, user_id: int, pc_id: int, cafe_id: int | None = None):
    """Log a session start event."""
    return log_event(db, "session.start", {"session_id": session_id}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)


def log_session_stop(db: Session, session_id: int, user_id: int, pc_id: int, duration_minutes: float = None, cafe_id: int | None = None):
    """Log a session stop event."""
    return log_event(db, "session.stop", {"session_id": session_id, "duration_minutes": duration_minutes}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)


def log_order_created(db: Session, order_id: int, user_id: int, total: float, items_count: int, cafe_id: int | None = None):
    """Log an order creation event."""
    return log_event(db, "order.created", {"order_id": order_id, "total": total, "items_count": items_count}, cafe_id=cafe_id, user_id=user_id)


def log_payment_confirmed(db: Session, purchase_id: str, user_id: int, pc_id: int, minutes: int, payment_method: str, cafe_id: int | None = None):
    """Log a payment confirmation event."""
    return log_event(db, "payment.confirmed", {"purchase_id": purchase_id, "minutes": minutes, "payment_method": payment_method}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)


def log_shop_purchase(db: Session, purchase_id: str, user_id: int, pc_id: int, pack_id: str, minutes: int, status: str, cafe_id: int | None = None):
    """Log a shop purchase event."""
    return log_event(db, "shop.purchase", {"purchase_id": purchase_id, "pack_id": pack_id, "minutes": minutes, "status": status}, cafe_id=cafe_id, pc_id=pc_id, user_id=user_id)
