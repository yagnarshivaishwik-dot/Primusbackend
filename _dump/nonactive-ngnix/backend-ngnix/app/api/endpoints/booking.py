from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.database import SessionLocal
from app.models import Booking
from app.schemas import BookingIn, BookingOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# User: create a booking
@router.post("/", response_model=BookingOut)
def create_booking(
    booking: BookingIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    # Check for overlaps
    overlap = (
        db.query(Booking)
        .filter(
            Booking.pc_id == booking.pc_id,
            Booking.status.in_(["pending", "confirmed"]),
            Booking.end_time > booking.start_time,
            Booking.start_time < booking.end_time,
        )
        .first()
    )
    if overlap:
        raise HTTPException(status_code=409, detail="PC already booked for that slot")
    b = Booking(
        user_id=current_user.id,
        pc_id=booking.pc_id,
        start_time=booking.start_time,
        end_time=booking.end_time,
        status="pending",
        created_at=datetime.utcnow(),
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    try:
        log_action(
            db,
            getattr(current_user, "id", None),
            "booking_create",
            f"PC:{b.pc_id} {b.start_time}->{b.end_time}",
            None,
        )
    except Exception:
        pass
    return b


# Admin/Staff: confirm booking
@router.post("/confirm/{booking_id}", response_model=BookingOut)
def confirm_booking(
    booking_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    b = db.query(Booking).filter_by(id=booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    b.status = "confirmed"
    db.commit()
    db.refresh(b)
    try:
        log_action(
            db, getattr(current_user, "id", None), "booking_confirm", f"Booking:{b.id}", None
        )
    except Exception:
        pass
    return b


# User: view my bookings
@router.get("/mine", response_model=list[BookingOut])
def my_bookings(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Booking)
        .filter_by(user_id=current_user.id)
        .order_by(Booking.start_time.desc())
        .all()
    )


# Admin: view all bookings
@router.get("/", response_model=list[BookingOut])
def all_bookings(current_user=Depends(require_role("admin")), db: Session = Depends(get_db)):
    return db.query(Booking).order_by(Booking.start_time.desc()).all()


# Bookings for a specific PC and day (admin or same cafe if needed)
@router.get("/pc/{pc_id}", response_model=list[BookingOut])
def bookings_for_pc(
    pc_id: int,
    date: datetime | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Booking).filter(Booking.pc_id == pc_id)
    if date is not None:
        start = datetime(date.year, date.month, date.day)
        end = start + timedelta(days=1)
        q = q.filter(Booking.start_time < end, Booking.end_time > start)
    return q.order_by(Booking.start_time.asc()).all()


# Next upcoming booking for a PC (future-only)
@router.get("/next/{pc_id}")
def next_booking(pc_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    b = (
        db.query(Booking)
        .filter(
            Booking.pc_id == pc_id,
            Booking.status.in_(["pending", "confirmed"]),
            Booking.start_time > now,
        )
        .order_by(Booking.start_time.asc())
        .first()
    )
    if not b:
        return None
    return {
        "id": b.id,
        "start_time": b.start_time,
        "end_time": b.end_time,
        "status": b.status,
    }


# User/Admin: cancel booking
@router.post("/cancel/{booking_id}", response_model=BookingOut)
def cancel_booking(
    booking_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    b = db.query(Booking).filter_by(id=booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    # Only admin or owner can cancel
    if current_user.role != "admin" and b.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed")
    b.status = "cancelled"
    db.commit()
    db.refresh(b)
    try:
        log_action(db, getattr(current_user, "id", None), "booking_cancel", f"Booking:{b.id}", None)
    except Exception:
        pass
    return b


# Admin: complete booking (after session)
@router.post("/complete/{booking_id}", response_model=BookingOut)
def complete_booking(
    booking_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    b = db.query(Booking).filter_by(id=booking_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    b.status = "completed"
    db.commit()
    db.refresh(b)
    try:
        log_action(
            db, getattr(current_user, "id", None), "booking_complete", f"Booking:{b.id}", None
        )
    except Exception:
        pass
    return b
