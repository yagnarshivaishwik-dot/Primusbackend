from fastapi import APIRouter, Depends, HTTPException, Request

from app import config

try:
    import stripe  # type: ignore
except Exception:
    stripe = None
try:
    import razorpay  # type: ignore
except Exception:
    razorpay = None
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Coupon, Order, OrderItem, Product, User, WalletTransaction

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class ProductIn(BaseModel):
    name: str
    price: float
    category_id: int | None = None


@router.post("/product", response_model=dict)
def create_product(
    p: ProductIn, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    prod = Product(name=p.name, price=p.price, category_id=p.category_id, active=True)
    db.add(prod)
    db.commit()
    db.refresh(prod)
    try:
        log_action(
            db,
            getattr(current_user, "id", None),
            "product_create",
            f"Product:{prod.id} {prod.name}",
            None,
        )
    except Exception:
        pass
    return {"id": prod.id}


@router.get("/product", response_model=list[dict])
def list_products(db: Session = Depends(get_db)):
    prods = db.query(Product).filter_by(active=True).all()
    return [
        {"id": p.id, "name": p.name, "price": p.price, "category_id": p.category_id} for p in prods
    ]


class OrderIn(BaseModel):
    items: list[dict]  # [{product_id, quantity}]
    coupon_code: str | None = None


@router.post("/order", response_model=dict)
def create_order(
    order: OrderIn,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not order.items:
        raise HTTPException(status_code=400, detail="No items")
    # Calculate total
    product_map = {
        p.id: p
        for p in db.query(Product)
        .filter(Product.id.in_([i["product_id"] for i in order.items]))
        .all()
    }
    total = 0.0
    for item in order.items:
        prod = product_map.get(item["product_id"]) if isinstance(item, dict) else None
        if not prod:
            raise HTTPException(
                status_code=404, detail=f"Product {item.get('product_id')} not found"
            )
        qty = int(item.get("quantity", 1))
        total += prod.price * qty
    user = db.query(User).filter_by(id=current_user.id).first()
    # Apply coupon if provided
    if order.coupon_code:
        cp = db.query(Coupon).filter_by(code=order.coupon_code).first()
        if cp and (cp.applies_to in ("*", "product")):
            total = max(0.0, round(total * (100.0 - cp.discount_percent) / 100.0, 2))
    if user.wallet_balance < total:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    user.wallet_balance -= total
    o = Order(user_id=user.id, total=total, created_at=datetime.utcnow())
    db.add(o)
    db.commit()
    db.refresh(o)
    # Create items and wallet tx
    for item in order.items:
        prod = product_map[item["product_id"]]
        qty = int(item.get("quantity", 1))
        db.add(OrderItem(order_id=o.id, product_id=prod.id, quantity=qty, price=prod.price))
    db.add(
        WalletTransaction(
            user_id=user.id,
            amount=-total,
            timestamp=datetime.utcnow(),
            type="deduct",
            description=f"Order #{o.id}",
        )
    )
    db.commit()

    # Audit log order creation
    try:
        log_action(
            db,
            current_user.id,
            "order_create",
            f"Order:{o.id} total:{total} items:{len(order.items)}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass  # Don't fail if audit logging fails

    return {"order_id": o.id, "total": total}


# Admin: list orders with basic filters
@router.get("/order", response_model=list[dict])
def list_orders(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    q = db.query(Order)
    # status placeholder (no field yet) — return all for now
    orders = q.order_by(Order.created_at.desc()).all()
    out = []
    for o in orders:
        u = db.query(User).filter_by(id=o.user_id).first()
        out.append(
            {
                "id": o.id,
                "datetime": o.created_at.isoformat() if o.created_at else None,
                "status": "paid",  # placeholder; extend later
                "username": u.name if u else None,
                "action": "purchase",
                "details": f"{len(db.query(OrderItem).filter_by(order_id=o.id).all())} items",
                "amount": o.total,
                "source": "wallet",
            }
        )
    return out


@router.post("/stripe/checkout", response_model=dict)
def create_stripe_checkout(
    order: OrderIn,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if stripe is None:
        raise HTTPException(status_code=400, detail="Stripe SDK not available on server")
    secret = config.STRIPE_SECRET
    if not secret:
        raise HTTPException(status_code=400, detail="Stripe not configured")
    stripe.api_key = secret
    currency = config.STRIPE_CURRENCY
    # Validate items and build line items
    product_map = {
        p.id: p
        for p in db.query(Product)
        .filter(Product.id.in_([i["product_id"] for i in order.items]))
        .all()
    }
    line_items = []
    for item in order.items:
        prod = product_map.get(item["product_id"]) if isinstance(item, dict) else None
        if not prod:
            raise HTTPException(
                status_code=404, detail=f"Product {item.get('product_id')} not found"
            )
        qty = int(item.get("quantity", 1))
        line_items.append(
            {
                "price_data": {
                    "currency": currency,
                    "product_data": {"name": prod.name},
                    "unit_amount": int(round(prod.price * 100)),
                },
                "quantity": max(1, qty),
            }
        )
    success_url = config.STRIPE_SUCCESS_URL
    cancel_url = config.STRIPE_CANCEL_URL
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=line_items,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": str(current_user.id)},
    )

    # Audit log Stripe checkout creation
    try:
        total_amount = (
            sum(item["price_data"]["unit_amount"] * item["quantity"] for item in line_items) / 100
        )
        log_action(
            db,
            current_user.id,
            "payment_stripe_checkout",
            f"Stripe session:{session.id} amount:{total_amount}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass

    return {"url": session.url}


@router.post("/razorpay/paymentlink", response_model=dict)
def create_razorpay_payment_link(
    order: OrderIn,
    request: Request,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if razorpay is None:
        raise HTTPException(status_code=400, detail="Razorpay SDK not available on server")
    key_id = config.RAZORPAY_KEY_ID
    key_secret = config.RAZORPAY_KEY_SECRET
    if not key_id or not key_secret:
        raise HTTPException(status_code=400, detail="Razorpay not configured")
    client = razorpay.Client(auth=(key_id, key_secret))
    currency = config.RAZORPAY_CURRENCY.upper()
    product_map = {
        p.id: p
        for p in db.query(Product)
        .filter(Product.id.in_([i["product_id"] for i in order.items]))
        .all()
    }
    total = 0.0
    description_parts = []
    for item in order.items:
        prod = product_map.get(item["product_id"]) if isinstance(item, dict) else None
        if not prod:
            raise HTTPException(
                status_code=404, detail=f"Product {item.get('product_id')} not found"
            )
        qty = int(item.get("quantity", 1))
        total += prod.price * qty
        description_parts.append(f"{prod.name}x{qty}")
    amount_subunits = int(round(total * 100))
    payload = {
        "amount": amount_subunits,
        "currency": currency,
        "description": ", ".join(description_parts) or "Purchase",
        "customer": {
            "name": getattr(current_user, "name", "Customer"),
            "email": getattr(current_user, "email", None),
        },
        "notify": {"email": True},
        "callback_url": config.RAZORPAY_SUCCESS_URL,
        "callback_method": "get",
    }
    try:
        link = client.payment_link.create(payload)

        # Audit log Razorpay payment link creation
        try:
            log_action(
                db,
                current_user.id,
                "payment_razorpay_link",
                f'Razorpay link:{link.get("id")} amount:{total}',
                str(request.client.host) if request.client else None,
            )
        except Exception:
            pass

        return {"url": link.get("short_url") or link.get("url")}
    except Exception as e:
        # Surface Razorpay error details while preserving traceback for debugging
        raise HTTPException(status_code=400, detail=f"Razorpay error: {e}") from e
