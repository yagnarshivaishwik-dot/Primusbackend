"""
Shop endpoints — time pack listings, purchases, and admin CRUD.

Multi-tenant: all Offer queries run against the per-cafe DB resolved
from ctx.cafe_id (set by JWT). cafe_id is NEVER accepted from the frontend.
"""
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.db.models_cafe import ClientPC, Offer, Session as PCSession, UserOffer
from app.db.router import cafe_db_router
from app.tasks.timeleft_broadcast import _compute_minutes_for_pc
from app.ws import admin as ws_admin
from app.ws.auth import build_event
from app.api.endpoints.remote_command import queue_device_event

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_cafe_db(ctx: AuthContext) -> Session:
    """Open per-cafe DB session from ctx. Raises 400 if cafe_id unresolvable."""
    if not ctx.cafe_id:
        raise HTTPException(status_code=400, detail="cafe_id could not be resolved from token")
    return cafe_db_router.get_session(ctx.cafe_id)


def _minutes(offer: Offer) -> int:
    """Return offer duration in minutes. hours_minutes column stores minutes."""
    return int(offer.hours_minutes or 0)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ShopPack(BaseModel):
    id: str
    name: str
    minutes: int
    price: float
    description: str | None = None
    active: bool = True


class OfferCreate(BaseModel):
    name: str
    hours: float          # frontend sends hours; we store as minutes
    price: float
    description: str | None = None
    active: bool = True


class OfferUpdate(BaseModel):
    name: str | None = None
    hours: float | None = None
    price: float | None = None
    description: str | None = None
    active: bool | None = None


class ShopPurchaseIn(BaseModel):
    client_id: int
    user_id: int
    pack_id: str
    payment_method: str | None = None
    queue_id: str | None = None


class PaymentConfirmIn(BaseModel):
    purchase_id: str
    client_id: int
    user_id: int
    minutes: int
    payment_method: str = "cash"


# ── Admin: Time Pack CRUD ─────────────────────────────────────────────────────

@router.get("/packs", response_model=list[ShopPack])
async def list_packs(
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Admin: Return all active time packs for this cafe.
    Scoped exclusively to the admin's own cafe via JWT.
    """
    db = _get_cafe_db(ctx)
    try:
        offers = db.query(Offer).filter(Offer.active.is_(True)).all()
        return [
            ShopPack(
                id=str(o.id),
                name=o.name,
                minutes=_minutes(o),
                price=float(o.price or 0),
                description=o.description,
                active=o.active,
            )
            for o in offers
        ]
    finally:
        db.close()


@router.post("/offers", response_model=dict)
async def create_offer(
    data: OfferCreate,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Admin: Create a new time package.
    cafe_id injected from JWT — never from frontend payload.
    """
    db = _get_cafe_db(ctx)
    try:
        minutes = int(round(data.hours * 60))
        offer = Offer(
            name=data.name,
            hours_minutes=minutes,
            price=data.price,
            description=data.description,
            active=data.active,
        )
        db.add(offer)
        db.commit()
        db.refresh(offer)
        return {
            "id": offer.id,
            "name": offer.name,
            "minutes": _minutes(offer),
            "price": float(offer.price),
            "active": offer.active,
        }
    finally:
        db.close()


@router.put("/offers/{offer_id}", response_model=dict)
async def update_offer(
    offer_id: int,
    data: OfferUpdate,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Admin: Update a time package.
    Validates ownership via the per-cafe DB session (implicit scoping).
    """
    db = _get_cafe_db(ctx)
    try:
        offer = db.query(Offer).filter_by(id=offer_id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")

        if data.name is not None:
            offer.name = data.name
        if data.hours is not None:
            offer.hours_minutes = int(round(data.hours * 60))
        if data.price is not None:
            offer.price = data.price
        if data.description is not None:
            offer.description = data.description
        if data.active is not None:
            offer.active = data.active

        db.commit()
        db.refresh(offer)
        return {
            "id": offer.id,
            "name": offer.name,
            "minutes": _minutes(offer),
            "price": float(offer.price),
            "active": offer.active,
        }
    finally:
        db.close()


@router.delete("/offers/{offer_id}", response_model=dict)
async def delete_offer(
    offer_id: int,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Admin: Soft-delete a time package (sets active=False).
    Only affects this cafe's DB — cross-cafe deletion is impossible.
    """
    db = _get_cafe_db(ctx)
    try:
        offer = db.query(Offer).filter_by(id=offer_id).first()
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        offer.active = False
        db.commit()
        return {"status": "deleted", "id": offer_id}
    finally:
        db.close()


# ── Client: Browse Packs (Tauri Shop) ────────────────────────────────────────

@router.get("/client/packs", response_model=list[ShopPack])
async def client_list_packs(
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Client-facing: Return active time packs for the client's own cafe only.
    Clients NEVER see packs from another cafe.
    """
    db = _get_cafe_db(ctx)
    try:
        offers = db.query(Offer).filter(Offer.active.is_(True)).all()
        return [
            ShopPack(
                id=str(o.id),
                name=o.name,
                minutes=_minutes(o),
                price=float(o.price or 0),
                description=o.description,
                active=True,
            )
            for o in offers
        ]
    finally:
        db.close()


# ── Purchase Flow ─────────────────────────────────────────────────────────────

@router.post("/purchase", response_model=dict)
async def purchase_pack(
    body: ShopPurchaseIn,
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Record a time pack purchase and broadcast real-time WebSocket events.
    """
    db = _get_cafe_db(ctx)
    try:
        # Resolve pack from this cafe's DB
        try:
            offer_id = int(body.pack_id)
            offer = db.query(Offer).filter_by(id=offer_id, active=True).first()
        except (ValueError, TypeError):
            offer = None

        if not offer:
            raise HTTPException(status_code=404, detail="Unknown pack_id")

        minutes_added = _minutes(offer)

        pc = db.query(ClientPC).filter_by(id=body.client_id).first()
        cafe_id = ctx.cafe_id

        try:
            prev_minutes = _compute_minutes_for_pc(db, body.client_id)
        except Exception:
            prev_minutes = 0

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
        try:
            await ws_admin.broadcast_admin(envelope, cafe_id=cafe_id)
        except Exception:
            pass
        try:
            queue_device_event(db, body.client_id, "shop.purchase", payload)
        except Exception:
            pass

        time_payload = {
            "client_id": body.client_id,
            "remaining_time_seconds": new_minutes * 60,
        }
        time_envelope = json.dumps(build_event("pc.time.update", time_payload))
        try:
            await ws_admin.broadcast_admin(time_envelope, cafe_id=cafe_id)
        except Exception:
            pass
        try:
            queue_device_event(db, body.client_id, "pc.time.update", time_payload)
        except Exception:
            pass

        try:
            log_action(db, body.user_id, "shop_purchase", f"Pack:{body.pack_id} Minutes:{minutes_added} Status:{status}", None)
        except Exception:
            pass

        return {
            "purchase_id": purchase_id,
            "minutes_added": minutes_added,
            "new_remaining_time": new_minutes * 60,
            "status": status,
            "pack": {"id": str(offer.id), "name": offer.name, "minutes": minutes_added, "price": float(offer.price)},
            "ts": int(datetime.now(UTC).timestamp()),
        }
    finally:
        db.close()


@router.post("/confirm-payment", response_model=dict)
async def confirm_payment(
    body: PaymentConfirmIn,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Admin: Confirm payment for a pending purchase.
    Adds time to user account, auto-starts a session, broadcasts updates.
    """
    db = _get_cafe_db(ctx)
    try:
        user_offer = UserOffer(
            user_id=body.user_id,
            offer_id=None,
            minutes_remaining=body.minutes,
        )
        db.add(user_offer)

        pc = db.query(ClientPC).filter_by(id=body.client_id).first()
        session_id = None
        if pc:
            pc.status = "in_use"
            pc.current_user_id = body.user_id
            new_session = PCSession(
                user_id=body.user_id,
                pc_id=body.client_id,
                start_time=datetime.now(UTC),
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            session_id = new_session.id
        else:
            db.commit()

        try:
            new_minutes = _compute_minutes_for_pc(db, body.client_id)
        except Exception:
            new_minutes = body.minutes

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
        cafe_id = ctx.cafe_id
        try:
            await ws_admin.broadcast_admin(envelope, cafe_id=cafe_id)
        except Exception:
            pass
        try:
            queue_device_event(db, body.client_id, "payment.confirmed", payload)
        except Exception:
            pass

        if session_id:
            session_payload = {
                "session_id": session_id,
                "client_id": body.client_id,
                "user_id": body.user_id,
                "start_time": datetime.now(UTC).isoformat(),
                "remaining_minutes": new_minutes,
            }
            try:
                queue_device_event(db, body.client_id, "session.started", session_payload)
            except Exception:
                pass

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
    finally:
        db.close()
