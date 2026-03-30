"""
Subscription & Invoicing endpoints.

Manages cafe-to-Primus billing: subscription plans, invoices, and payments.
All data lives in the global database.
"""

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.auth.context import AuthContext, get_auth_context, require_role
from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscription", tags=["Subscriptions"])


# ---- Pydantic Schemas ----

class CreateSubscriptionRequest(BaseModel):
    cafe_id: int
    plan: str = Field(..., pattern="^(trial|starter|pro|enterprise)$")
    billing_cycle: str = Field("monthly", pattern="^(monthly|yearly)$")
    custom_amount: Decimal | None = None


class PaySubscriptionRequest(BaseModel):
    amount: Decimal = Field(..., gt=0)
    payment_method: str
    payment_reference: str
    invoice_id: str | None = None


class UpdateSubscriptionRequest(BaseModel):
    plan: str | None = Field(None, pattern="^(trial|starter|pro|enterprise)$")
    status: str | None = Field(None, pattern="^(active|past_due|cancelled|expired)$")


# ---- Endpoints ----

@router.post("/create")
def create_subscription(
    req: CreateSubscriptionRequest,
    current_user=Depends(require_role("superadmin")),
    db: DBSession = Depends(get_db),
):
    """Create a new subscription for a cafe. Superadmin only."""
    from app.services.subscription import create_subscription as svc_create
    try:
        result = svc_create(
            db=db,
            cafe_id=req.cafe_id,
            plan=req.plan,
            billing_cycle=req.billing_cycle,
            custom_amount=req.custom_amount,
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{cafe_id}")
def get_subscription(
    cafe_id: int,
    current_user=Depends(require_role("superadmin", "cafeadmin", "admin", "owner")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """Get subscription for a cafe."""
    # Enforce: cafeadmin can only see their own cafe
    if not ctx.has_role("superadmin") and ctx.cafe_id != cafe_id:
        raise HTTPException(status_code=403, detail="Cannot view other cafe's subscription")

    from app.services.subscription import get_subscription as svc_get
    result = svc_get(db, cafe_id)
    if not result:
        raise HTTPException(status_code=404, detail="No subscription found for this cafe")
    return result


@router.put("/{subscription_id}")
def update_subscription(
    subscription_id: str,
    req: UpdateSubscriptionRequest,
    current_user=Depends(require_role("superadmin")),
    db: DBSession = Depends(get_db),
):
    """Update a subscription. Superadmin only."""
    from app.services.subscription import update_subscription as svc_update
    try:
        result = svc_update(
            db=db,
            subscription_id=subscription_id,
            plan=req.plan,
            status=req.status,
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pay")
def pay_subscription(
    req: PaySubscriptionRequest,
    current_user=Depends(require_role("cafeadmin", "admin", "owner", "superadmin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """Record a subscription payment."""
    from app.services.subscription import record_payment

    cafe_id = ctx.cafe_id
    if not cafe_id:
        raise HTTPException(status_code=400, detail="cafe_id required")

    result = record_payment(
        db=db,
        cafe_id=cafe_id,
        amount=req.amount,
        payment_method=req.payment_method,
        payment_reference=req.payment_reference,
        invoice_id=req.invoice_id,
    )
    db.commit()
    return result


# ---- Invoice Endpoints ----

invoices_router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


@invoices_router.get("")
def list_invoices(
    cafe_id: int | None = None,
    status: str | None = None,
    current_user=Depends(require_role("superadmin", "cafeadmin", "admin", "owner")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """List invoices. Superadmin sees all, cafeadmin sees own cafe."""
    from app.db.models_global import Invoice

    query = db.query(Invoice)

    if ctx.has_role("superadmin"):
        if cafe_id:
            query = query.filter_by(cafe_id=cafe_id)
    else:
        query = query.filter_by(cafe_id=ctx.cafe_id)

    if status:
        query = query.filter_by(status=status)

    invoices = query.order_by(Invoice.created_at.desc()).limit(50).all()

    return [
        {
            "id": str(inv.id),
            "cafe_id": inv.cafe_id,
            "amount": str(inv.amount),
            "currency": inv.currency,
            "status": inv.status,
            "due_date": inv.due_date.isoformat(),
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "payment_method": inv.payment_method,
            "created_at": inv.created_at.isoformat(),
        }
        for inv in invoices
    ]


@invoices_router.get("/{invoice_id}")
def get_invoice(
    invoice_id: str,
    current_user=Depends(require_role("superadmin", "cafeadmin", "admin", "owner")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """Get invoice details."""
    import uuid
    from app.db.models_global import Invoice

    inv = db.query(Invoice).filter_by(id=uuid.UUID(invoice_id)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not ctx.has_role("superadmin") and inv.cafe_id != ctx.cafe_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "id": str(inv.id),
        "subscription_id": str(inv.subscription_id) if inv.subscription_id else None,
        "cafe_id": inv.cafe_id,
        "amount": str(inv.amount),
        "currency": inv.currency,
        "status": inv.status,
        "due_date": inv.due_date.isoformat(),
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "payment_method": inv.payment_method,
        "payment_reference": inv.payment_reference,
        "line_items": inv.line_items,
        "created_at": inv.created_at.isoformat(),
    }
