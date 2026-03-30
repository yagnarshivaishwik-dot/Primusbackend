"""
UPI payment integration via Razorpay.

Handles UPI Collect and QR-based payments for Indian users.
Provides payment intent creation, verification, and webhook processing.
"""

import hashlib
import hmac
import logging
from decimal import Decimal
from typing import Optional

import razorpay

from app.config import RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, UPI_WEBHOOK_SECRET

logger = logging.getLogger(__name__)


def _get_razorpay_client() -> razorpay.Client:
    """Get configured Razorpay client."""
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise ValueError("Razorpay credentials not configured")
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def create_upi_order(
    amount: Decimal,
    currency: str = "INR",
    receipt: str = "",
    notes: dict = None,
) -> dict:
    """
    Create a Razorpay order for UPI payment.

    Args:
        amount: Payment amount (in main currency unit, e.g., INR)
        currency: Currency code (default INR)
        receipt: Order receipt identifier
        notes: Additional metadata

    Returns:
        Razorpay order dict with id, amount, status
    """
    client = _get_razorpay_client()

    # Razorpay expects amount in paise (smallest currency unit)
    amount_paise = int(amount * 100)

    order_data = {
        "amount": amount_paise,
        "currency": currency,
        "receipt": receipt,
        "payment_capture": 1,  # Auto-capture
    }
    if notes:
        order_data["notes"] = notes

    order = client.order.create(data=order_data)
    logger.info("Created Razorpay UPI order: %s for amount %s paise", order["id"], amount_paise)
    return order


def generate_upi_payment_link(
    order_id: str,
    amount: Decimal,
    customer_name: str = "",
    customer_email: str = "",
    customer_phone: str = "",
    description: str = "Primus Wallet Topup",
    upi_vpa: Optional[str] = None,
) -> dict:
    """
    Generate a UPI payment link or QR for a Razorpay order.

    Returns dict with:
        - payment_link: URL for UPI payment
        - qr_data: QR code data (if applicable)
        - order_id: Razorpay order ID
    """
    client = _get_razorpay_client()

    amount_paise = int(amount * 100)

    link_data = {
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
        "customer": {},
        "notify": {"sms": False, "email": False},
        "callback_url": "",
        "callback_method": "get",
    }

    if customer_name:
        link_data["customer"]["name"] = customer_name
    if customer_email:
        link_data["customer"]["email"] = customer_email
    if customer_phone:
        link_data["customer"]["contact"] = customer_phone

    # For UPI collect flow with VPA
    result = {
        "order_id": order_id,
        "razorpay_key": RAZORPAY_KEY_ID,
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
    }

    if upi_vpa:
        result["prefill"] = {"vpa": upi_vpa}
        result["method"] = "upi"

    return result


def verify_payment_signature(
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    """
    Verify Razorpay payment signature using HMAC-SHA256.

    This MUST be called before crediting user wallets to prevent
    forged payment confirmations.
    """
    try:
        client = _get_razorpay_client()
        client.utility.verify_payment_signature({
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        logger.warning(
            "Payment signature verification failed: order=%s payment=%s",
            razorpay_order_id, razorpay_payment_id,
        )
        return False


def verify_webhook_signature(
    payload_body: bytes,
    signature: str,
    secret: str = None,
) -> bool:
    """
    Verify Razorpay webhook signature.

    Uses HMAC-SHA256 to validate the webhook payload wasn't tampered with.
    """
    webhook_secret = secret or UPI_WEBHOOK_SECRET
    if not webhook_secret:
        logger.error("UPI_WEBHOOK_SECRET not configured, cannot verify webhook")
        return False

    expected = hmac.new(
        webhook_secret.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def fetch_payment_details(payment_id: str) -> dict:
    """Fetch payment details from Razorpay."""
    client = _get_razorpay_client()
    return client.payment.fetch(payment_id)


def fetch_order_payments(order_id: str) -> list:
    """Fetch all payments for a Razorpay order."""
    client = _get_razorpay_client()
    return client.order.payments(order_id).get("items", [])
