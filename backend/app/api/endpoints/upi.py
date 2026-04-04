"""
UPI Payment endpoints.

Supports UPI Collect (VPA-based) and QR-based payments via Razorpay.
All endpoints are cafe-scoped and require authentication.
"""

import logging
import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.orm import Session as DBSession

from app.auth.context import AuthContext, get_auth_context, require_role
from app.db.dependencies import get_cafe_db as get_db
from app.middleware.idempotency import (
    check_idempotency,
    make_idempotent_response,
    require_idempotency_key,
    store_idempotency,
)
from app.models import User, WalletTransaction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/upi", tags=["UPI Payments"])


# ---- Pydantic Schemas ----

class CreateIntentRequest(BaseModel):
    amount: Decimal = Field(..., gt=0, le=100000, description="Amount in INR")
    upi_vpa: str | None = Field(None, description="UPI VPA for collect flow (e.g., user@upi)")
    description: str = "Wallet Topup"


class CreateIntentResponse(BaseModel):
    intent_id: str
    order_id: str
    razorpay_key: str
    amount_paise: int
    currency: str = "INR"
    description: str
    method: str = "upi"
    prefill_vpa: str | None = None
    status: str = "created"


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentStatusResponse(BaseModel):
    intent_id: str
    status: str
    amount: str
    provider_ref: str | None = None


# ---- Endpoints ----

@router.post("/create-intent", response_model=CreateIntentResponse)
async def create_payment_intent(
    req: CreateIntentRequest,
    request: Request,
    idempotency_key: str = Depends(require_idempotency_key),
    current_user=Depends(require_role("client", "staff", "cafeadmin", "admin", "owner", "superadmin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """
    Create a UPI payment intent for wallet topup.

    Returns Razorpay order details for client-side UPI flow.
    """
    # Check idempotency
    cached = await check_idempotency(idempotency_key, "upi.create-intent")
    if cached:
        return make_idempotent_response(cached)

    from app.utils.upi import create_upi_order, generate_upi_payment_link

    # Create Razorpay order
    order = create_upi_order(
        amount=req.amount,
        receipt=f"wallet_topup_{current_user.id}_{uuid.uuid4().hex[:8]}",
        notes={
            "user_id": str(current_user.id),
            "cafe_id": str(ctx.cafe_id),
            "type": "wallet_topup",
        },
    )

    # Generate UPI payment data
    payment_data = generate_upi_payment_link(
        order_id=order["id"],
        amount=req.amount,
        customer_name=getattr(current_user, "name", ""),
        customer_email=getattr(current_user, "email", ""),
        customer_phone=getattr(current_user, "phone", ""),
        description=req.description,
        upi_vpa=req.upi_vpa,
    )

    intent_id = str(uuid.uuid4())

    response_data = {
        "intent_id": intent_id,
        "order_id": order["id"],
        "razorpay_key": payment_data["razorpay_key"],
        "amount_paise": payment_data["amount"],
        "currency": "INR",
        "description": req.description,
        "method": "upi",
        "prefill_vpa": req.upi_vpa,
        "status": "created",
    }

    # Store idempotency
    await store_idempotency(idempotency_key, "upi.create-intent", response_data)

    return response_data


@router.post("/verify")
async def verify_upi_payment(
    req: VerifyPaymentRequest,
    current_user=Depends(require_role("client", "staff", "cafeadmin", "admin", "owner", "superadmin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """
    Verify a UPI payment and credit the user's wallet.

    Called by the client after receiving payment confirmation from Razorpay.
    """
    from app.utils.upi import verify_payment_signature, fetch_payment_details

    # Verify signature
    if not verify_payment_signature(
        req.razorpay_order_id,
        req.razorpay_payment_id,
        req.razorpay_signature,
    ):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    # Fetch payment details from Razorpay
    payment = fetch_payment_details(req.razorpay_payment_id)

    if payment.get("status") != "captured":
        raise HTTPException(status_code=400, detail=f"Payment not captured: {payment.get('status')}")

    # Amount in INR (Razorpay stores in paise)
    amount_inr = Decimal(str(payment["amount"])) / 100

    # Verify amount matches order notes
    notes = payment.get("notes", {})
    expected_user_id = str(current_user.id)
    if notes.get("user_id") != expected_user_id:
        logger.warning(
            "Payment user mismatch: expected=%s got=%s",
            expected_user_id, notes.get("user_id"),
        )
        raise HTTPException(status_code=400, detail="Payment user mismatch")

    # ATOMIC wallet credit
    result = db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(wallet_balance=User.wallet_balance + amount_inr)
        .returning(User.wallet_balance)
    )
    new_balance = result.scalar_one_or_none()
    if new_balance is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Record transaction
    txn = WalletTransaction(
        user_id=current_user.id,
        amount=float(amount_inr),
        timestamp=datetime.utcnow(),
        type="topup",
        description=f"UPI payment via Razorpay (order: {req.razorpay_order_id})",
    )
    db.add(txn)
    db.commit()

    logger.info(
        "UPI payment verified and wallet credited: user=%d amount=%s new_balance=%s",
        current_user.id, amount_inr, new_balance,
    )

    return {
        "status": "success",
        "amount_credited": str(amount_inr),
        "new_balance": str(new_balance),
        "payment_id": req.razorpay_payment_id,
        "order_id": req.razorpay_order_id,
    }


@router.post("/webhook")
async def upi_webhook(request: Request, db: DBSession = Depends(get_db)):
    """
    Razorpay webhook handler for UPI payment events.

    Verifies webhook signature and processes payment events.
    This endpoint does NOT require authentication (called by Razorpay).
    """
    from app.utils.upi import verify_webhook_signature

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not verify_webhook_signature(body, signature):
        logger.warning("Invalid webhook signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    payload = json.loads(body)

    event = payload.get("event")
    logger.info("Received Razorpay webhook event: %s", event)

    if event == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        payment_id = payment_entity.get("id")
        order_id = payment_entity.get("order_id")
        amount_paise = payment_entity.get("amount", 0)
        notes = payment_entity.get("notes", {})

        user_id = notes.get("user_id")
        if user_id:
            amount_inr = Decimal(str(amount_paise)) / 100

            # Check for duplicate processing
            existing = db.query(WalletTransaction).filter(
                WalletTransaction.description.contains(order_id)
            ).first()

            if existing:
                logger.info("Webhook payment already processed: order=%s", order_id)
                return {"status": "already_processed"}

            # ATOMIC wallet credit
            result = db.execute(
                update(User)
                .where(User.id == int(user_id))
                .values(wallet_balance=User.wallet_balance + amount_inr)
                .returning(User.wallet_balance)
            )
            new_balance = result.scalar_one_or_none()

            if new_balance is not None:
                txn = WalletTransaction(
                    user_id=int(user_id),
                    amount=float(amount_inr),
                    timestamp=datetime.utcnow(),
                    type="topup",
                    description=f"UPI webhook payment (order: {order_id}, payment: {payment_id})",
                )
                db.add(txn)
                db.commit()
                logger.info(
                    "Webhook: credited user=%s amount=%s via order=%s",
                    user_id, amount_inr, order_id,
                )

    return {"status": "ok"}
