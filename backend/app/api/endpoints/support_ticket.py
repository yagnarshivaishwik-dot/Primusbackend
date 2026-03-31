from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import SupportTicket
from app.schemas import SupportTicketIn, SupportTicketOut

router = APIRouter()


# Create a ticket (user or staff)
@router.post("/", response_model=SupportTicketOut)
def create_ticket(
    ticket: SupportTicketIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    t = SupportTicket(
        user_id=current_user.id,
        pc_id=ticket.pc_id,
        cafe_id=ctx.cafe_id,
        issue=ticket.issue,
        status="open",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


# Get my tickets
@router.get("/mine", response_model=list[SupportTicketOut])
def my_tickets(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    ts = (
        scoped_query(db, SupportTicket, ctx)
        .filter(SupportTicket.user_id == current_user.id)
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
    return ts


# Admin/staff: List all tickets
@router.get("/", response_model=list[SupportTicketOut])
def list_tickets(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    ts = scoped_query(db, SupportTicket, ctx).order_by(SupportTicket.created_at.desc()).all()
    return ts


# Admin/staff: Update status/assign ticket
@router.post("/update/{ticket_id}", response_model=SupportTicketOut)
def update_ticket(
    ticket_id: int,
    status: str,
    assigned_staff: int | None = None,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    t = db.query(SupportTicket).filter_by(id=ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    enforce_cafe_ownership(t, ctx)
    t.status = status
    t.assigned_staff = assigned_staff
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return t
