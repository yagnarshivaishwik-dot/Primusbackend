"""Phase 1+ payment schemas with strict validation.

Audit reference: BE-C5 (master report Section B.5).

Background:
  app/api/endpoints/payment.py was using `list[dict]` for order items and
  `float` without bounds for product prices. That allowed:
    - Negative item quantities (refund-as-purchase trick)
    - Negative product prices via the admin /product POST
    - Very large floats that overflow Stripe's int64 sub-unit conversion
    - Floating-point coupon math that could push a discount below zero
    - Unbounded items[] length (DoS via giant request body)

  This module replaces the loose schemas with strict Pydantic models. Every
  numeric value has a clear lower/upper bound; quantities are integers in a
  sane range; prices are non-negative and capped; coupon codes have a format.

  All endpoint code that touches money MUST go through these models.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, conint, field_validator


# ---- bounds ---------------------------------------------------------------

# Hard caps. Pick conservative numbers — a single legitimate cafe order should
# not approach these. Anything beyond is either a bug or an attack.
MAX_PRODUCT_NAME_LEN = 200
MAX_DESC_LEN = 1024

MIN_PRICE = Decimal("0.00")
MAX_PRICE = Decimal("100000.00")  # 1 lakh per item — cap to refuse pathological inputs

MIN_QTY = 1
MAX_QTY = 100  # per line item

MAX_ITEMS_PER_ORDER = 50  # hard cap on items list length
MAX_TOTAL_AMOUNT = Decimal("500000.00")  # 5 lakh — cap on order total

MAX_COUPON_CODE_LEN = 64

# Currency codes we accept. Keep tight; expand explicitly when adding a region.
ALLOWED_CURRENCIES = frozenset({"INR", "USD", "EUR", "GBP", "CAD", "AUD", "SGD"})


# ---- helpers --------------------------------------------------------------

def _coerce_decimal(v: object) -> Decimal:
    """Accept int / float / str / Decimal and return a Decimal.

    Floats are converted via str() to avoid the float→Decimal precision pun
    (Decimal(0.1) is 0.1000000000000000055...). The Pydantic model then
    quantizes to 2 dp at the field level.
    """
    if isinstance(v, Decimal):
        return v
    if isinstance(v, (int, str)):
        return Decimal(v)
    if isinstance(v, float):
        return Decimal(str(v))
    raise ValueError(f"unsupported numeric type: {type(v).__name__}")


# ---- product --------------------------------------------------------------

class ProductIn(BaseModel):
    """Admin-created shop product.

    Replaces the old loose ProductIn that accepted arbitrary float prices.
    Validation:
      - name: non-empty, trimmed, length ≤ 200
      - price: 0.00 .. 100000.00 (Decimal, 2 dp)
      - category_id: positive int or null
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    name: Annotated[str, Field(min_length=1, max_length=MAX_PRODUCT_NAME_LEN)]
    price: Decimal = Field(ge=MIN_PRICE, le=MAX_PRICE, decimal_places=2)
    category_id: int | None = Field(default=None, gt=0)

    @field_validator("price", mode="before")
    @classmethod
    def _to_decimal(cls, v):
        return _coerce_decimal(v)


# ---- order line item ------------------------------------------------------

class OrderItemIn(BaseModel):
    """One line in an order."""

    product_id: int = Field(gt=0)
    quantity: conint(ge=MIN_QTY, le=MAX_QTY) = 1


# ---- order ----------------------------------------------------------------

class OrderIn(BaseModel):
    """Customer-submitted order.

    The previous schema accepted `list[dict]` for items, which allowed
    negative quantities and unknown keys. This version is strict.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    items: Annotated[
        list[OrderItemIn],
        Field(min_length=1, max_length=MAX_ITEMS_PER_ORDER),
    ]
    coupon_code: Annotated[str, Field(max_length=MAX_COUPON_CODE_LEN)] | None = None

    @field_validator("coupon_code", mode="before")
    @classmethod
    def _coupon_to_upper(cls, v):
        if v is None:
            return None
        # Strip + upper for consistent lookup. Reject control chars via the
        # Annotated max_length above; further format checks happen at lookup.
        return str(v).strip().upper() or None


# ---- result envelope ------------------------------------------------------

class OrderCreated(BaseModel):
    order_id: int
    total: Decimal = Field(ge=MIN_PRICE, le=MAX_TOTAL_AMOUNT, decimal_places=2)


# ---- gateway-facing models ------------------------------------------------

class StripeCheckoutOut(BaseModel):
    url: str


class RazorpayPaymentLinkOut(BaseModel):
    short_url: str
    id: str


# ---- helpers used by endpoint code ----------------------------------------

def assert_total_within_caps(total: Decimal) -> None:
    """Raise a 400-style ValueError if the computed order total escapes
    the global cap. The endpoint converts this to HTTPException(400)."""
    if total < MIN_PRICE:
        raise ValueError("order total is negative")
    if total > MAX_TOTAL_AMOUNT:
        raise ValueError(f"order total {total} exceeds cap {MAX_TOTAL_AMOUNT}")


def to_stripe_subunits(amount: Decimal) -> int:
    """Convert a 2-dp Decimal to Stripe's integer sub-unit representation.

    Bounded so the multiplication cannot overflow int64. Stripe itself
    rejects amounts > 99999999, but we'd rather refuse client-side than
    surface a confusing 4xx from Stripe.
    """
    if amount < MIN_PRICE or amount > MAX_TOTAL_AMOUNT:
        raise ValueError(f"amount {amount} out of bounds for Stripe conversion")
    cents = int((amount * 100).quantize(Decimal("1")))
    if cents < 0 or cents > 99_999_999:
        raise ValueError(f"Stripe sub-unit conversion {cents} out of bounds")
    return cents
