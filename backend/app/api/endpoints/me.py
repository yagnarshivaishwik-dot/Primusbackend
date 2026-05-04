"""Mobile-friendly /user/me endpoints (read + patch + avatar upload).

Lives next to user.py because user.py is admin-oriented (CRUD over the
list of users); this module is the *self* surface for the mobile app.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.db.models_global import UserGlobal

router = APIRouter()


class MeOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    phone: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    coins_balance: int = 0
    is_email_verified: bool = False

    model_config = {"from_attributes": True}


class MePatchIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=64)
    phone: str | None = Field(None, max_length=20)
    bio: str | None = Field(None, max_length=500)


@router.get("/me", response_model=MeOut)
def get_me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/me", response_model=MeOut)
def patch_me(
    body: MePatchIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.name is not None:
        user.name = body.name.strip()
    if body.phone is not None:
        user.phone = body.phone.strip() or None
    if body.bio is not None:
        user.bio = body.bio.strip() or None

    db.commit()
    db.refresh(user)
    return user


# ──────────── Avatar upload ────────────

ALLOWED_AVATAR_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


def _avatar_storage_dir() -> Path:
    """Resolve the on-disk avatar directory (created if missing).

    Mounted as /uploads/avatars in docker-compose.mobile.yml so the API
    can serve them via a static file route in production reverse proxy.
    """
    base = Path(os.getenv("AVATAR_DIR", "uploads/avatars"))
    base.mkdir(parents=True, exist_ok=True)
    return base


@router.post("/me/avatar", response_model=MeOut, status_code=status.HTTP_201_CREATED)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a new profile avatar image (JPEG / PNG / WebP, ≤ 2 MB).

    Stores the file under uploads/avatars/<user_id>-<uuid>.<ext> and writes
    the public URL onto user.avatar_url. The previous file (if any) is
    deleted best-effort.
    """
    if file.content_type not in ALLOWED_AVATAR_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {file.content_type}. "
                   f"Allowed: {sorted(ALLOWED_AVATAR_MIME)}",
        )

    # Read with size cap
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_AVATAR_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Avatar too large (max {MAX_AVATAR_BYTES} bytes)",
            )
        chunks.append(chunk)

    ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }[file.content_type]

    storage_dir = _avatar_storage_dir()
    fname = f"{current_user.id}-{uuid.uuid4().hex}{ext}"
    fpath = storage_dir / fname
    fpath.write_bytes(b"".join(chunks))

    # Construct a publicly-servable URL based on the request's base URL.
    base_url = str(request.base_url).rstrip("/")
    new_url = f"{base_url}/static/avatars/{fname}"

    user = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Best-effort delete previous local file (only if it points into our dir)
    prev = user.avatar_url
    if prev and "/static/avatars/" in prev:
        try:
            old_name = prev.rsplit("/", 1)[-1]
            (storage_dir / old_name).unlink(missing_ok=True)
        except Exception:
            pass

    user.avatar_url = new_url
    db.commit()
    db.refresh(user)
    return user


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.avatar_url and "/static/avatars/" in user.avatar_url:
        try:
            old_name = user.avatar_url.rsplit("/", 1)[-1]
            (_avatar_storage_dir() / old_name).unlink(missing_ok=True)
        except Exception:
            pass
    user.avatar_url = None
    db.commit()
    return None
