from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Booking, ClientPC, License
from app.schemas import ClientPCCreate, ClientPCOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# PC agent registers itself (with license key)
@router.post("/register", response_model=ClientPCOut)
def register_pc(pc: ClientPCCreate, request: Request, db: Session = Depends(get_db)):
    license_obj = db.query(License).filter_by(key=pc.license_key).first()
    if not license_obj:
        raise HTTPException(status_code=404, detail="Invalid license key")
    # Enforce max_pcs
    existing_pcs = db.query(ClientPC).filter_by(license_key=pc.license_key).count()
    if existing_pcs >= license_obj.max_pcs:
        raise HTTPException(status_code=403, detail="Max PC count reached for this license")
    # Create PC
    # Bind device on first registration
    dev_id = request.headers.get("X-Device-Id") or request.headers.get("X-Machine-Id")
    new_pc = ClientPC(
        license_key=pc.license_key,
        name=pc.name,
        ip_address=pc.ip_address or str(request.client.host),
        status="online",
        last_seen=datetime.utcnow(),
        cafe_id=license_obj.cafe_id,
        device_id=dev_id,
        bound=True,
        bound_at=datetime.utcnow(),
        grace_until=datetime.utcnow() + timedelta(days=3),
    )
    db.add(new_pc)
    db.commit()
    db.refresh(new_pc)
    return new_pc


# PC agent sends heartbeat (keep status up to date)
@router.post("/heartbeat/{pc_id}")
def pc_heartbeat(pc_id: int, request: Request, db: Session = Depends(get_db)):
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    # Enforce device binding and grace/suspend
    dev_id = request.headers.get("X-Device-Id") or request.headers.get("X-Machine-Id")
    now = datetime.utcnow()
    if pc.suspended:
        raise HTTPException(status_code=403, detail="PC suspended")
    if pc.bound:
        if pc.device_id and dev_id and pc.device_id != dev_id:
            raise HTTPException(status_code=403, detail="Device mismatch")
    else:
        # not bound; allow only within license grace window
        if pc.grace_until and now > pc.grace_until:
            raise HTTPException(status_code=403, detail="Grace period over; rebind required")
    # Lock if there is a confirmed upcoming booking within the next 5 minutes
    now = datetime.utcnow()
    window = now + timedelta(minutes=5)
    upcoming = (
        db.query(Booking)
        .filter(
            Booking.pc_id == pc.id,
            Booking.status.in_(["confirmed"]),
            Booking.start_time > now,
            Booking.start_time <= window,
        )
        .first()
    )
    # Unlock after start time
    pc.status = "locked" if upcoming else "online"
    pc.last_seen = datetime.utcnow()
    pc.ip_address = str(request.client.host)
    db.commit()
    try:
        log_action(
            db,
            None,
            "pc_heartbeat",
            f"PC:{pc_id} status:{pc.status}",
            request.client.host if request and request.client else None,
        )
    except Exception:
        pass
    return {"status": pc.status}


# Admin/API: Rebind a client PC to a new device within grace or by admin override
@router.post("/rebind/{pc_id}")
def rebind_pc(
    pc_id: int,
    request: Request,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")
    dev_id = request.headers.get("X-Device-Id") or request.headers.get("X-Machine-Id")
    if not dev_id:
        raise HTTPException(status_code=400, detail="Missing device id header")
    pc.device_id = dev_id
    pc.bound = True
    pc.bound_at = datetime.utcnow()
    pc.grace_until = datetime.utcnow() + timedelta(days=3)
    db.commit()
    return {"status": "rebound"}


# List PCs for the current user's cafe
@router.get("/", response_model=list[ClientPCOut])
def list_pcs(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "superadmin":
        return db.query(ClientPC).all()
    if not current_user.cafe_id:
        raise HTTPException(status_code=403, detail="Not assigned to any cafe")
    return db.query(ClientPC).filter_by(cafe_id=current_user.cafe_id).all()


def enforce_license(license_obj: License, db: Session):
    if not license_obj.is_active:
        raise HTTPException(status_code=403, detail="License is revoked")
    if license_obj.expires_at and license_obj.expires_at < datetime.utcnow():
        raise HTTPException(status_code=403, detail="License is expired")
    pc_count = db.query(ClientPC).filter_by(license_key=license_obj.key).count()
    if pc_count > license_obj.max_pcs:
        raise HTTPException(status_code=403, detail="License max PC count exceeded")
