import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.api.endpoints.remote_command import queue_device_event
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.database import get_db
from app.models import ClientPC, Offer
from app.tasks.timeleft_broadcast import _compute_minutes_for_pc
from app.ws import admin as ws_admin
from app.ws.auth import build_event

router = APIRouter()


class ShopPack(BaseModel):
    id: str
    name: str
    minutes: int
    price: float


# Default fallback packs if no offers exist in database
DEFAULT_PACKS: list[ShopPack] = [
    ShopPack(id="pack1", name="1 Hour", minutes=60, price=100.0),
    ShopPack(id="pack2", name="2 Hours", minutes=120, price=180.0),
    ShopPack(id="pack3", name="5 Hours", minutes=300, price=400.0),
]


def get_packs_from_db(db: Session) -> list[ShopPack]:
    """
    Fetch active offers from the database and convert to ShopPack format.
    Falls back to default packs if no offers exist.
    """
    offers = db.query(Offer).filter(Offer.active.is_(True)).all()
    if not offers:
        return DEFAULT_PACKS

    return [
        ShopPack(
            id=str(o.id),
            name=o.name,
            minutes=int((o.hours or 0) * 60),
            price=float(o.price or 0)
        )
        for o in offers
    ]


@router.get("/packs", response_model=list[ShopPack])
async def list_packs(
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Return available time packs from the database (Offer table), scoped by cafe.
    """
    offers = scoped_query(db, Offer, ctx).filter(Offer.active.is_(True)).all()
    if not offers:
        return DEFAULT_PACKS
    return [
        ShopPack(
            id=str(o.id),
            name=o.name,
            minutes=int((o.hours or 0) * 60),
            price=float(o.price or 0),
        )
        for o in offers
    ]


class ShopPurchaseIn(BaseModel):
    client_id: int
    user_id: int
    pack_id: str
    payment_method: str | None = None
    queue_id: str | None = None


@router.post("/purchase", response_model=dict)
async def purchase_pack(
    body: ShopPurchaseIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Record a time pack purchase and emit real-time WebSocket events.

    NOTE: For now this endpoint does not modify billing tables; it computes
    remaining time based on existing billing state and the purchased minutes,
    then broadcasts the new effective remaining time.
    """
    # Look up pack from database
    packs = get_packs_from_db(db)
    pack = next((p for p in packs if p.id == body.pack_id), None)
    if not pack:
        raise HTTPException(status_code=404, detail="Unknown pack_id")

    # Ensure the caller is the same user or an admin/staff-like role
    if current_user.id != body.user_id and getattr(current_user, "role", None) not in (
        "admin",
        "owner",
        "superadmin",
        "staff",
    ):
        raise HTTPException(status_code=403, detail="Not allowed to purchase for this user")

    # Look up cafe_id for scoped broadcasting
    _pc = db.query(ClientPC).filter_by(id=body.client_id).first()
    _cafe_id = _pc.cafe_id if _pc else None

    # Compute previous remaining minutes for this client PC, if any
    try:
        prev_minutes = _compute_minutes_for_pc(db, body.client_id)
    except Exception:
        prev_minutes = 0

    minutes_added = pack.minutes
    new_minutes = max(0, (prev_minutes or 0) + minutes_added)

    status = "pending" if body.queue_id else "completed"
    purchase_id = uuid.uuid4().hex

    payload = {
        "purchase_id": purchase_id,
        "client_id": body.client_id,
        "user_id": body.user_id,
        "pack_id": body.pack_id,
        "minutes_added": minutes_added,
        "new_remaining_time": new_minutes * 60,
        "status": status,
    }

    envelope = json.dumps(build_event("shop.purchase", payload))

    # Emit purchase event to admins and the specific PC
    try:
        await ws_admin.broadcast_admin(envelope, cafe_id=_cafe_id)
    except Exception:
        pass
    try:
        queue_device_event(db, body.client_id, "shop.purchase", payload)
    except Exception:
        pass

    # Also broadcast a pc.time.update event to keep remaining_time in sync
    time_payload = {
        "client_id": body.client_id,
        "remaining_time_seconds": new_minutes * 60,
    }
    time_envelope = json.dumps(build_event("pc.time.update", time_payload))
    try:
        await ws_admin.broadcast_admin(time_envelope, cafe_id=_cafe_id)
    except Exception:
        pass
    try:
        queue_device_event(db, body.client_id, "pc.time.update", time_payload)
    except Exception:
        pass

    # Audit log the purchase
    try:
        log_action(db, body.user_id, "shop_purchase", f"Pack:{body.pack_id} Minutes:{minutes_added} Status:{status}", None)
    except Exception:
        pass

    return {
        "purchase_id": purchase_id,
        "minutes_added": minutes_added,
        "new_remaining_time": new_minutes * 60,
        "status": status,
        "pack": pack.dict(),
        "ts": int(datetime.now(UTC).timestamp()),
    }


# Admin CRUD endpoints for managing time packages (Offers)

class OfferCreate(BaseModel):
    name: str
    hours: float
    price: float
    description: str | None = None
    active: bool = True


class OfferUpdate(BaseModel):
    name: str | None = None
    hours: float | None = None
    price: float | None = None
    description: str | None = None
    active: bool | None = None


@router.post("/offers", response_model=dict)
async def create_offer(
    data: OfferCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Admin: Create a new time package/offer."""
    offer = Offer(
        name=data.name,
        hours=data.hours,
        price=data.price,
        description=data.description,
        active=data.active,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return {"id": offer.id, "name": offer.name, "hours": offer.hours, "price": offer.price, "active": offer.active}


@router.put("/offers/{offer_id}", response_model=dict)
async def update_offer(
    offer_id: int,
    data: OfferUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Admin: Update an existing time package/offer."""
    offer = db.query(Offer).filter_by(id=offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    if data.name is not None:
        offer.name = data.name
    if data.hours is not None:
        offer.hours = data.hours
    if data.price is not None:
        offer.price = data.price
    if data.description is not None:
        offer.description = data.description
    if data.active is not None:
        offer.active = data.active

    db.commit()
    return {"id": offer.id, "name": offer.name, "hours": offer.hours, "price": offer.price, "active": offer.active}


@router.delete("/offers/{offer_id}", response_model=dict)
async def delete_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """Admin: Delete a time package/offer."""
    offer = db.query(Offer).filter_by(id=offer_id).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    db.delete(offer)
    db.commit()
    return {"status": "deleted", "id": offer_id}


# Admin Payment Confirmation - confirms pending order and auto-starts session

class PaymentConfirmIn(BaseModel):
    purchase_id: str
    client_id: int
    user_id: int
    minutes: int
    payment_method: str = "cash"


@router.post("/confirm-payment", response_model=dict)
async def confirm_payment(
    body: PaymentConfirmIn,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    """
    Admin: Confirm payment for a pending purchase.
    This will:
    1. Add time to user's billing
    2. Auto-start a session on the client PC
    3. Broadcast real-time updates to admin and client
    """
    from app.models import ClientPC, UserOffer
    from app.models import Session as PCSession

    # Add time to user's account via UserOffer
    user_offer = UserOffer(
        user_id=body.user_id,
        offer_id=None,  # Direct time addition
        hours_remaining=body.minutes / 60.0,
    )
    db.add(user_offer)

    # Auto-start session on the PC
    pc = db.query(ClientPC).filter_by(id=body.client_id).first()
    if pc:
        # Update PC status
        pc.status = "in_use"
        pc.current_user_id = body.user_id

        # Create new session
        new_session = PCSession(
            user_id=body.user_id,
            client_pc_id=body.client_id,
            start_time=datetime.now(UTC),
        )
        db.add(new_session)
        db.commit()
        db.refresh(new_session)
        session_id = new_session.id
    else:
        db.commit()
        session_id = None

    # Calculate new remaining minutes
    try:
        new_minutes = _compute_minutes_for_pc(db, body.client_id)
    except Exception:
        new_minutes = body.minutes

    # Broadcast payment confirmed event
    payload = {
        "purchase_id": body.purchase_id,
        "client_id": body.client_id,
        "user_id": body.user_id,
        "minutes_added": body.minutes,
        "new_remaining_time": new_minutes * 60,
        "session_id": session_id,
        "status": "confirmed",
    }

    envelope = json.dumps(build_event("payment.confirmed", payload))
    _confirm_cafe_id = pc.cafe_id if pc else None
    try:
        await ws_admin.broadcast_admin(envelope, cafe_id=_confirm_cafe_id)
    except Exception:
        pass
    try:
        queue_device_event(db, body.client_id, "payment.confirmed", payload)
    except Exception:
        pass

    # Also send session.started event to client
    if session_id:
        session_payload = {
            "session_id": session_id,
            "client_id": body.client_id,
            "user_id": body.user_id,
            "start_time": datetime.now(UTC).isoformat(),
            "remaining_minutes": new_minutes,
        }
        # Broadcast session.started event to the device
        try:
            queue_device_event(db, body.client_id, "session.started", session_payload)
        except Exception:
            pass

    # Audit log the payment confirmation
    try:
        log_action(db, body.user_id, "payment_confirmed", f"Purchase:{body.purchase_id} Minutes:{body.minutes} SessionId:{session_id}", None)
    except Exception:
        pass

    return {
        "status": "confirmed",
        "purchase_id": body.purchase_id,
        "session_id": session_id,
        "minutes_added": body.minutes,
        "new_remaining_time": new_minutes * 60,
    }
