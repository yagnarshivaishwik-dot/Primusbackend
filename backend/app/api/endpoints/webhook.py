from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import Webhook
from app.schemas import WebhookIn, WebhookOut
from app.utils.encryption import encrypt_value

router = APIRouter()


# Admin: create webhook
@router.post("/", response_model=WebhookOut)
def create_webhook(
    wh: WebhookIn,
    request: Request,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Create a new webhook (admin only)."""
    secret = wh.secret or ""
    encrypted_secret = encrypt_value(secret) if secret else ""
    webhook = Webhook(
        url=wh.url,
        event=wh.event,
        secret=encrypted_secret,
        cafe_id=ctx.cafe_id,
        created_at=datetime.utcnow(),
        is_active=True,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)

    # Audit log webhook creation
    try:
        log_action(
            db,
            current_user.id,
            "webhook_create",
            f"Webhook:{webhook.id} event:{wh.event} url:{wh.url[:50]}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass

    return webhook


# List all webhooks (admin only - webhooks may contain secrets)
@router.get("/", response_model=list[WebhookOut])
def list_webhooks(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    webhooks = scoped_query(db, Webhook, ctx).all()
    # Mask secrets in response to prevent exposure
    masked_webhooks = []
    for wh in webhooks:
        wh_dict = {
            "id": wh.id,
            "url": wh.url,
            "event": wh.event,
            "secret": "***" if wh.secret else None,  # Mask secret
            "created_at": wh.created_at,
            "is_active": wh.is_active,
        }
        masked_webhooks.append(wh_dict)
    return masked_webhooks


# Deactivate webhook
@router.post("/deactivate/{webhook_id}")
def deactivate_webhook(
    webhook_id: int,
    request: Request,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Deactivate a webhook (admin only)."""
    wh = db.query(Webhook).filter_by(id=webhook_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    enforce_cafe_ownership(wh, ctx)
    wh.is_active = False
    db.commit()

    # Audit log webhook deactivation
    try:
        log_action(
            db,
            current_user.id,
            "webhook_deactivate",
            f"Webhook:{webhook_id} event:{wh.event}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass

    return {"message": "Webhook deactivated"}
