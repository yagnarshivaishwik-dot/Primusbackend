from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.database import SessionLocal
from app.models import ClientUpdate
from app.schemas import ClientUpdateIn, ClientUpdateOut

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Admin: create a new client update
@router.post("/", response_model=ClientUpdateOut)
def create_update(
    update: ClientUpdateIn,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    u = ClientUpdate(
        version=update.version,
        description=update.description,
        file_url=update.file_url,
        force_update=update.force_update,
        release_date=datetime.utcnow(),
        active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# Get the latest active update (for client to check)
@router.get("/latest", response_model=ClientUpdateOut | None)
def get_latest_update(db: Session = Depends(get_db)):
    u = (
        db.query(ClientUpdate)
        .filter_by(active=True)
        .order_by(ClientUpdate.release_date.desc())
        .first()
    )
    return u


# Admin: deactivate old updates (optional)
@router.post("/deactivate/{update_id}")
def deactivate_update(
    update_id: int, current_user=Depends(require_role("admin")), db: Session = Depends(get_db)
):
    u = db.query(ClientUpdate).filter_by(id=update_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Update not found")
    u.active = False
    db.commit()
    return {"message": "Update deactivated."}
