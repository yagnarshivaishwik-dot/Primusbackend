"""Marketing campaign CRUD endpoints."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import get_cafe_db as get_db
from app.db.models_cafe import Campaign

logger = logging.getLogger(__name__)

router = APIRouter()


# ---- Schemas ----

class CampaignIn(BaseModel):
    name: str
    type: str = "discount"  # discount | announcement | promotion
    content: Optional[str] = None
    image_url: Optional[str] = None
    discount_percent: float = 0.0
    target_audience: str = "all"  # all | members | guests
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    active: bool = True


class CampaignOut(BaseModel):
    id: int
    name: str
    type: str
    content: Optional[str]
    image_url: Optional[str]
    discount_percent: float
    target_audience: str
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---- Endpoints ----

@router.get("/", response_model=list[CampaignOut])
def list_campaigns(
    current_user=Depends(require_role("staff")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    return db.query(Campaign).order_by(Campaign.created_at.desc()).all()


@router.post("/", response_model=CampaignOut)
def create_campaign(
    data: CampaignIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    # Common fields (always safe).
    fields = dict(
        name=data.name,
        type=data.type,
        content=data.content,
        image_url=data.image_url,
        discount_percent=data.discount_percent,
        target_audience=data.target_audience,
        start_date=data.start_date,
        end_date=data.end_date,
        active=data.active,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    # `created_by` is a FK to users.id IN THE CAFE DB. The admin user lives
    # in the GLOBAL DB, so its id may not exist in the cafe DB's users
    # table → INSERT fails with sqlalchemy.exc.IntegrityError → 500. Try
    # with created_by first; on FK violation, retry without it (the column
    # is nullable on the model). Same defensive pattern would apply to any
    # other cross-DB FK that ends up in cafe-scoped admin-CRUD endpoints.
    campaign = Campaign(**fields, created_by=current_user.id)
    db.add(campaign)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning(
            "create_campaign: FK violation on created_by=%s — retrying without it (%s)",
            current_user.id, exc.orig if hasattr(exc, "orig") else exc,
        )
        campaign = Campaign(**fields, created_by=None)
        db.add(campaign)
        db.commit()
    db.refresh(campaign)
    return campaign


@router.put("/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: int,
    data: CampaignIn,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    for field, value in data.model_dump().items():
        setattr(campaign, field, value)
    campaign.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return campaign


@router.patch("/{campaign_id}/toggle", response_model=CampaignOut)
def toggle_campaign(
    campaign_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign.active = not campaign.active
    campaign.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)
    return campaign


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    db.delete(campaign)
    db.commit()
    return {"message": f"Campaign {campaign_id} deleted"}
