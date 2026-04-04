"""
Subscription service for cafe-to-Primus billing.

Manages subscription plans, invoices, and payment recording.
All data lives in the global database.
"""

import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Plan definitions
PLANS = {
    "trial": {
        "name": "Trial",
        "amount": Decimal("0"),
        "duration_days": 30,
        "features": ["basic_analytics", "up_to_10_pcs"],
    },
    "starter": {
        "name": "Starter",
        "amount": Decimal("999"),
        "duration_days": 30,
        "features": ["analytics", "up_to_25_pcs", "email_support"],
    },
    "pro": {
        "name": "Professional",
        "amount": Decimal("2499"),
        "duration_days": 30,
        "features": ["advanced_analytics", "up_to_100_pcs", "priority_support", "custom_branding"],
    },
    "enterprise": {
        "name": "Enterprise",
        "amount": Decimal("4999"),
        "duration_days": 30,
        "features": ["all_features", "unlimited_pcs", "dedicated_support", "sla"],
    },
}


def create_subscription(
    db: Session,
    cafe_id: int,
    plan: str,
    billing_cycle: str = "monthly",
    custom_amount: Optional[Decimal] = None,
) -> dict:
    """
    Create a new subscription for a cafe.

    Args:
        db: Global database session
        cafe_id: Cafe ID
        plan: Plan key (trial, starter, pro, enterprise)
        billing_cycle: monthly or yearly
        custom_amount: Override default plan amount
    """
    from app.db.models_global import Subscription

    if plan not in PLANS:
        raise ValueError(f"Invalid plan: {plan}. Must be one of: {list(PLANS.keys())}")

    plan_def = PLANS[plan]
    amount = custom_amount if custom_amount is not None else plan_def["amount"]

    if billing_cycle == "yearly":
        duration_days = 365
        amount = amount * 10  # 2 months free on yearly
    else:
        duration_days = plan_def["duration_days"]

    now = datetime.utcnow()
    period_end = now + timedelta(days=duration_days)

    sub = Subscription(
        cafe_id=cafe_id,
        plan=plan,
        status="active",
        amount=amount,
        currency="INR",
        billing_cycle=billing_cycle,
        current_period_start=now,
        current_period_end=period_end,
        trial_ends_at=period_end if plan == "trial" else None,
    )
    db.add(sub)
    db.flush()

    # Generate initial invoice (unless trial)
    if plan != "trial" and amount > 0:
        _generate_invoice(db, sub)

    logger.info("Created subscription %s for cafe %d (plan=%s)", sub.id, cafe_id, plan)
    return {
        "subscription_id": str(sub.id),
        "plan": plan,
        "status": "active",
        "amount": str(amount),
        "period_start": now.isoformat(),
        "period_end": period_end.isoformat(),
    }


def get_subscription(db: Session, cafe_id: int) -> Optional[dict]:
    """Get active subscription for a cafe."""
    from app.db.models_global import Subscription

    sub = (
        db.query(Subscription)
        .filter_by(cafe_id=cafe_id)
        .order_by(Subscription.created_at.desc())
        .first()
    )
    if not sub:
        return None

    return {
        "subscription_id": str(sub.id),
        "cafe_id": sub.cafe_id,
        "plan": sub.plan,
        "status": sub.status,
        "amount": str(sub.amount),
        "currency": sub.currency,
        "billing_cycle": sub.billing_cycle,
        "period_start": sub.current_period_start.isoformat(),
        "period_end": sub.current_period_end.isoformat(),
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "created_at": sub.created_at.isoformat(),
    }


def update_subscription(
    db: Session,
    subscription_id: str,
    plan: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    """Update a subscription plan or status."""
    from app.db.models_global import Subscription

    sub = db.query(Subscription).filter_by(id=uuid.UUID(subscription_id)).first()
    if not sub:
        raise ValueError(f"Subscription {subscription_id} not found")

    if plan and plan in PLANS:
        sub.plan = plan
        sub.amount = PLANS[plan]["amount"]
    if status:
        sub.status = status
        if status == "cancelled":
            sub.cancelled_at = datetime.utcnow()

    sub.updated_at = datetime.utcnow()
    db.flush()

    logger.info("Updated subscription %s: plan=%s status=%s", subscription_id, plan, status)
    return get_subscription(db, sub.cafe_id)


def record_payment(
    db: Session,
    cafe_id: int,
    amount: Decimal,
    payment_method: str,
    payment_reference: str,
    invoice_id: Optional[str] = None,
) -> dict:
    """Record a subscription payment."""
    from app.db.models_global import Invoice, Subscription

    # Find the latest active subscription
    sub = (
        db.query(Subscription)
        .filter_by(cafe_id=cafe_id, status="active")
        .order_by(Subscription.created_at.desc())
        .first()
    )

    # Update invoice if specified
    if invoice_id:
        inv = db.query(Invoice).filter_by(id=uuid.UUID(invoice_id)).first()
        if inv:
            inv.status = "paid"
            inv.paid_at = datetime.utcnow()
            inv.payment_method = payment_method
            inv.payment_reference = payment_reference

    # If subscription was past_due, reactivate
    if sub and sub.status == "past_due":
        sub.status = "active"
        sub.updated_at = datetime.utcnow()

    db.flush()

    logger.info(
        "Recorded payment for cafe %d: amount=%s method=%s ref=%s",
        cafe_id, amount, payment_method, payment_reference,
    )

    return {
        "status": "recorded",
        "amount": str(amount),
        "payment_method": payment_method,
        "payment_reference": payment_reference,
    }


def _generate_invoice(db: Session, subscription) -> None:
    """Generate an invoice for a subscription period."""
    from app.db.models_global import Invoice

    invoice = Invoice(
        subscription_id=subscription.id,
        cafe_id=subscription.cafe_id,
        amount=subscription.amount,
        currency=subscription.currency,
        status="issued",
        due_date=subscription.current_period_start + timedelta(days=7),
        line_items={
            "items": [{
                "description": f"{PLANS.get(subscription.plan, {}).get('name', subscription.plan)} Plan - {subscription.billing_cycle}",
                "amount": str(subscription.amount),
                "currency": subscription.currency,
            }]
        },
    )
    db.add(invoice)
    logger.info("Generated invoice for subscription %s", subscription.id)


def check_expiring_subscriptions(db: Session) -> list:
    """Find subscriptions expiring within 7 days."""
    from app.db.models_global import Subscription

    threshold = datetime.utcnow() + timedelta(days=7)
    expiring = (
        db.query(Subscription)
        .filter(
            Subscription.status == "active",
            Subscription.current_period_end <= threshold,
        )
        .all()
    )
    return [{"cafe_id": s.cafe_id, "plan": s.plan, "expires": s.current_period_end.isoformat()} for s in expiring]
