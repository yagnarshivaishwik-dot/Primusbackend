import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.db.dependencies import get_global_db as get_db
from app.models import Cafe, ClientPC, License, LicenseAssignment, PlatformAccount
from app.schemas import (
    LicenseAssignIn,
    LicenseAssignOut,
    LicenseCreate,
    LicenseOut,
    PlatformAccountIn,
    PlatformAccountOut,
)
from app.utils.encryption import encrypt_value
from app.utils.license import create_signed_license_key, decode_signed_license_key

router = APIRouter()



# SUPERADMIN: Issue license for a cafe
@router.post("/", response_model=LicenseOut)
def create_license(
    lic: LicenseCreate,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    cafe = db.query(Cafe).filter_by(id=lic.cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    if db.query(License).filter_by(key=lic.key).first():
        raise HTTPException(status_code=400, detail="License key already exists")
    license_obj = License(
        key=lic.key, cafe_id=lic.cafe_id, expires_at=lic.expires_at, max_pcs=lic.max_pcs
    )
    db.add(license_obj)
    db.commit()
    db.refresh(license_obj)
    return license_obj


# SUPERADMIN: Auto-generate license key (signed JWT)
@router.post("/auto", response_model=LicenseOut)
def create_auto_license(
    cafe_id: int,
    expires_at: datetime,
    max_pcs: int,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    key = create_signed_license_key(cafe_id=cafe_id, max_pcs=max_pcs, expires_at=expires_at)
    license_obj = License(key=key, cafe_id=cafe_id, expires_at=expires_at, max_pcs=max_pcs)
    db.add(license_obj)
    db.commit()
    db.refresh(license_obj)
    return license_obj


# SUPERADMIN: Generate a signed license key without persisting (for offline provisioning)
@router.post("/signed/generate")
def generate_signed_license(
    cafe_id: int,
    max_pcs: int,
    expires_at: datetime | None = None,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    """
    Generate a cryptographically signed license key (JWT).
    The caller is responsible for storing this key and sending it to the cafe admin.
    """
    cafe = db.query(Cafe).filter_by(id=cafe_id).first()
    if not cafe:
        raise HTTPException(status_code=404, detail="Cafe not found")
    key = create_signed_license_key(cafe_id=cafe_id, max_pcs=max_pcs, expires_at=expires_at)
    return {"key": key, "cafe_id": cafe_id, "max_pcs": max_pcs, "expires_at": expires_at}


# Inspect / decode a signed license key (superadmin only)
@router.get("/signed/inspect")
def inspect_signed_license(
    key: str,
    current_user=Depends(require_role("superadmin")),
):
    """Decode a signed license key to inspect its embedded claims."""
    payload = decode_signed_license_key(key)
    if payload is None:
        raise HTTPException(status_code=400, detail="Not a valid signed license key")
    return payload


# SUPERADMIN/CAFEADMIN: List all licenses for my cafe
@router.get("/", response_model=list[LicenseOut])
def list_licenses(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "superadmin":
        return db.query(License).all()
    elif current_user.cafe_id:
        return db.query(License).filter_by(cafe_id=current_user.cafe_id).all()
    else:
        return []


# CAFEADMIN: Get your active license keys
@router.get("/mine", response_model=list[LicenseOut])
def my_licenses(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.cafe_id:
        return []
    return db.query(License).filter_by(cafe_id=current_user.cafe_id).all()


@router.post("/revoke/{key}")
def revoke_license(
    key: str, current_user=Depends(require_role("superadmin")), db: Session = Depends(get_db)
):
    lic = db.query(License).filter_by(key=key).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.is_active = False
    db.commit()
    # Suspend all PCs under this license
    db.query(ClientPC).filter_by(license_key=key).update({ClientPC.suspended: True})
    db.commit()
    return {"message": f"License {key} revoked"}


@router.post("/activate/{key}")
def activate_license(
    key: str, current_user=Depends(require_role("superadmin")), db: Session = Depends(get_db)
):
    lic = db.query(License).filter_by(key=key).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.is_active = True
    db.commit()
    db.query(ClientPC).filter_by(license_key=key).update({ClientPC.suspended: False})
    db.commit()
    return {"message": f"License {key} activated"}


@router.post("/extend/{key}")
def extend_license(
    key: str,
    new_expiry: datetime,
    current_user=Depends(require_role("superadmin")),
    db: Session = Depends(get_db),
):
    lic = db.query(License).filter_by(key=key).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License not found")
    lic.expires_at = new_expiry
    db.commit()
    return {"message": f"License {key} expiry updated"}


# ===== Pooled platform accounts =====


@router.post("/platform", response_model=PlatformAccountOut)
def add_platform_account(
    data: PlatformAccountIn,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    secret = data.secret or ""
    # Encrypt platform account secrets at rest using envelope encryption (AES-256-GCM with KEK from Vault).
    encrypted_secret = encrypt_value(secret) if secret else ""
    acct = PlatformAccount(
        game_id=data.game_id,
        platform=data.platform,
        username=data.username,
        secret=encrypted_secret,
        in_use=False,
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return acct


@router.get("/platform", response_model=list[PlatformAccountOut])
def list_platform_accounts(
    current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    return db.query(PlatformAccount).all()


@router.post("/assign", response_model=LicenseAssignOut)
def assign_license(
    body: LicenseAssignIn, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    # Global-time model: no pooled account assignment; return a faux assignment for client bookkeeping
    assignment = LicenseAssignment(
        account_id=0,
        user_id=current_user.id,
        pc_id=body.pc_id,
        game_id=body.game_id,
        started_at=datetime.utcnow(),
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post("/release/{assignment_id}")
def release_license(
    assignment_id: int, current_user=Depends(get_current_user), db: Session = Depends(get_db)
):
    la = db.query(LicenseAssignment).filter_by(id=assignment_id, user_id=current_user.id).first()
    if not la:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if la.ended_at:
        return {"message": "Already released"}
    la.ended_at = datetime.utcnow()
    db.commit()
    return {"message": "License released"}
