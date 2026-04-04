"""
Internal dashboard endpoints for Super Admin portal.

Provides aggregated metrics and stats for the admin dashboard.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.db.dependencies import get_global_db as get_db
from app.models import Cafe, ClientPC, License, User

router = APIRouter()


class DashboardStats(BaseModel):
    total_cafes: int
    active_cafes: int
    pending_cafes: int
    suspended_cafes: int
    total_pcs: int
    online_pcs: int
    offline_pcs: int
    total_licenses: int
    active_licenses: int
    expiring_soon: int  # Within 7 days
    total_revenue: float
    monthly_revenue: float
    growth_percent: float


class CafeListItem(BaseModel):
    id: int
    name: str
    owner_name: str | None
    owner_email: str | None
    status: str
    pc_count: int
    online_pc_count: int
    license_status: str
    subscription_end: str | None
    created_at: str | None


class CafeDetail(BaseModel):
    id: int
    name: str
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    owner_id: int | None
    owner_name: str | None
    owner_email: str | None
    owner_phone: str | None
    status: str
    created_at: str | None
    pcs: list[dict]
    licenses: list[dict]
    stats: dict


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Get aggregated dashboard statistics for Super Admin.
    """
    # Café counts
    total_cafes = db.query(func.count(Cafe.id)).scalar() or 0

    # PC counts
    total_pcs = db.query(func.count(ClientPC.id)).scalar() or 0

    # Count online PCs (last seen within 5 minutes)
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    online_pcs = db.query(func.count(ClientPC.id)).filter(
        ClientPC.last_seen >= five_min_ago,
        ClientPC.status == "online"
    ).scalar() or 0

    # License counts
    total_licenses = db.query(func.count(License.id)).scalar() or 0
    active_licenses = db.query(func.count(License.id)).filter(
        License.is_active.is_(True)
    ).scalar() or 0

    # Licenses expiring in next 7 days
    seven_days = datetime.utcnow() + timedelta(days=7)
    expiring_soon = db.query(func.count(License.id)).filter(
        License.is_active.is_(True),
        License.expires_at <= seven_days,
        License.expires_at > datetime.utcnow()
    ).scalar() or 0

    return DashboardStats(
        total_cafes=total_cafes,
        active_cafes=total_cafes,  # TODO: Add cafe status field
        pending_cafes=0,
        suspended_cafes=0,
        total_pcs=total_pcs,
        online_pcs=online_pcs,
        offline_pcs=total_pcs - online_pcs,
        total_licenses=total_licenses,
        active_licenses=active_licenses,
        expiring_soon=expiring_soon,
        total_revenue=0.0,  # TODO: Integrate with billing
        monthly_revenue=0.0,
        growth_percent=0.0,
    )


@router.get("/cafes", response_model=list[CafeListItem])
async def list_cafes_internal(
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Get list of all cafés with summary info.
    """
    cafes = db.query(Cafe).all()
    result = []

    five_min_ago = datetime.utcnow() - timedelta(minutes=5)

    for cafe in cafes:
        # Get owner info
        owner = db.query(User).filter_by(id=cafe.owner_id).first() if cafe.owner_id else None

        # Get PC counts
        pcs = db.query(ClientPC).filter_by(cafe_id=cafe.id).all()
        pc_count = len(pcs)
        online_pc_count = sum(1 for pc in pcs if pc.last_seen and pc.last_seen >= five_min_ago)

        # Get license info
        license_obj = db.query(License).filter_by(cafe_id=cafe.id, is_active=True).first()
        license_status = "none"
        subscription_end = None

        if license_obj:
            if license_obj.expires_at:
                subscription_end = license_obj.expires_at.isoformat()
                if license_obj.expires_at < datetime.utcnow():
                    license_status = "expired"
                elif license_obj.expires_at < datetime.utcnow() + timedelta(days=7):
                    license_status = "expiring"
                else:
                    license_status = "active"
            else:
                license_status = "active"

        result.append(CafeListItem(
            id=cafe.id,
            name=cafe.name,
            owner_name=owner.name if owner else None,
            owner_email=owner.email if owner else None,
            status="active",  # TODO: Add cafe status field
            pc_count=pc_count,
            online_pc_count=online_pc_count,
            license_status=license_status,
            subscription_end=subscription_end,
            created_at=cafe.created_at.isoformat() if hasattr(cafe, 'created_at') and cafe.created_at else None,
        ))

    return result


@router.get("/cafes/{cafe_id}", response_model=CafeDetail)
async def get_cafe_detail(
    cafe_id: int,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Get detailed information about a specific café.
    """
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Café not found")

    # Get owner
    owner = db.query(User).filter_by(id=cafe.owner_id).first() if cafe.owner_id else None

    # Get PCs
    pcs = db.query(ClientPC).filter_by(cafe_id=cafe.id).all()
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)

    pc_list = [{
        "id": pc.id,
        "name": pc.name,
        "status": "online" if pc.last_seen and pc.last_seen >= five_min_ago else "offline",
        "last_seen": pc.last_seen.isoformat() if pc.last_seen else None,
        "ip_address": pc.ip_address,
    } for pc in pcs]

    # Get licenses
    licenses = db.query(License).filter_by(cafe_id=cafe.id).all()
    license_list = [{
        "id": lic.id,
        "key": lic.key,
        "is_active": lic.is_active,
        "expires_at": lic.expires_at.isoformat() if lic.expires_at else None,
        "max_pcs": lic.max_pcs,
    } for lic in licenses]

    # Calculate stats
    online_count = sum(1 for pc in pcs if pc.last_seen and pc.last_seen >= five_min_ago)
    stats = {
        "total_pcs": len(pcs),
        "online_pcs": online_count,
        "offline_pcs": len(pcs) - online_count,
        "active_licenses": sum(1 for lic in licenses if lic.is_active),
    }

    return CafeDetail(
        id=cafe.id,
        name=cafe.name,
        address=getattr(cafe, 'address', None),
        city=getattr(cafe, 'city', None),
        state=getattr(cafe, 'state', None),
        country=getattr(cafe, 'country', None),
        owner_id=cafe.owner_id,
        owner_name=owner.name if owner else None,
        owner_email=owner.email if owner else None,
        owner_phone=owner.phone if owner else None,
        status="active",
        created_at=cafe.created_at.isoformat() if hasattr(cafe, 'created_at') and cafe.created_at else None,
        pcs=pc_list,
        licenses=license_list,
        stats=stats,
    )


class CafeUpdateRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None


@router.put("/cafes/{cafe_id}")
async def update_cafe(
    cafe_id: int,
    payload: CafeUpdateRequest,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Update café details (SuperAdmin only).
    """
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Café not found")

    if payload.name is not None:
        cafe.name = payload.name
    if payload.address is not None and hasattr(cafe, 'address'):
        cafe.address = payload.address
    if payload.city is not None and hasattr(cafe, 'city'):
        cafe.city = payload.city
    if payload.state is not None and hasattr(cafe, 'state'):
        cafe.state = payload.state
    if payload.country is not None and hasattr(cafe, 'country'):
        cafe.country = payload.country

    db.commit()

    return {"message": "Café updated successfully", "id": cafe.id}


@router.post("/cafes/{cafe_id}/suspend")
async def suspend_cafe(
    cafe_id: int,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Suspend a café (SuperAdmin only).
    """
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Café not found")

    # Suspend all licenses
    db.query(License).filter_by(cafe_id=cafe_id).update({License.is_active: False})

    # Suspend all PCs
    db.query(ClientPC).filter_by(cafe_id=cafe_id).update({ClientPC.suspended: True})

    db.commit()

    return {"message": "Café suspended successfully", "id": cafe.id}


@router.post("/cafes/{cafe_id}/reactivate")
async def reactivate_cafe(
    cafe_id: int,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Reactivate a suspended café (SuperAdmin only).
    """
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Café not found")

    # Reactivate licenses
    db.query(License).filter_by(cafe_id=cafe_id).update({License.is_active: True})

    # Reactivate PCs
    db.query(ClientPC).filter_by(cafe_id=cafe_id).update({ClientPC.suspended: False})

    db.commit()

    return {"message": "Café reactivated successfully", "id": cafe.id}
