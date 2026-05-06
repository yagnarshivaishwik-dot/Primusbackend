"""Profile picture endpoints (Azure-backed, multi-cafe-safe).

Mounted at `/api/profile` from `app/main.py`.

Routes
------
- GET    /api/profile               — return the authenticated user with
                                      `profilePictureUrl` populated from DB.
- POST   /api/profile/upload-picture — multipart upload; replaces the
                                      previous picture and persists the
                                      new URL globally.
- DELETE /api/profile/picture       — delete the blob and clear the DB
                                      field; the client must immediately
                                      switch to the default avatar.

Validation
----------
- Extension whitelist (`.jpg`, `.jpeg`, `.png`, `.webp`) AND
- MIME whitelist (`image/jpeg`, `image/png`, `image/webp`) AND
- Magic-byte sniff via Pillow (rejects mislabelled files / payloads).
- Size cap of 5 MiB (per spec).

Storage is delegated to :mod:`app.services.profile_picture_storage`
(Azure Blob Storage in production, local disk in dev).
"""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.models import User
from app.services.profile_picture_storage import (
    ALLOWED_MIME,
    MAX_PROFILE_PICTURE_BYTES,
    get_backend,
    to_absolute_url,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Response shapes (camelCase to match the C# kiosk's expectation in spec §6/§11)
# ---------------------------------------------------------------------------


class ProfileOut(BaseModel):
    """Canonical profile payload returned to the C# kiosk."""

    id: int
    username: str
    name: str
    email: str
    role: str
    profile_picture_url: str | None = None
    profile_picture_updated_at: datetime | None = None

    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class UploadPictureResponse(BaseModel):
    success: bool = True
    profile_picture_url: str
    profile_picture_updated_at: datetime


def _build_profile_out(user: User) -> ProfileOut:
    return ProfileOut(
        id=int(user.id),
        # `username` is what the kiosk displays — fall back to the local-part of
        # the email when no dedicated username column exists.
        username=(user.first_name or (user.email.split("@", 1)[0] if user.email else user.name or "")),
        name=user.name or "",
        email=user.email or "",
        role=user.role or "client",
        profile_picture_url=user.profile_picture_url,
        profile_picture_updated_at=user.profile_picture_updated_at,
    )


# ---------------------------------------------------------------------------
# GET /api/profile
# ---------------------------------------------------------------------------


@router.get("", response_model=ProfileOut)
def get_profile(current_user: User = Depends(get_current_user)) -> ProfileOut:
    return _build_profile_out(current_user)


# ---------------------------------------------------------------------------
# POST /api/profile/upload-picture
# ---------------------------------------------------------------------------


def _normalize_mime(mime: str | None) -> str | None:
    if not mime:
        return None
    mime = mime.lower().split(";", 1)[0].strip()
    if mime in ALLOWED_MIME:
        return mime
    return None


def _validate_image_bytes(content: bytes, *, declared_mime: str) -> str:
    """Magic-byte validation. Returns the canonical mime on success.

    Pillow is used because file extension and the declared `Content-Type`
    header are user-controllable; we have to inspect the actual bytes.
    """
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:  # pragma: no cover - pillow is a hard requirement
        raise HTTPException(status_code=500, detail="Image validation unavailable")

    try:
        with Image.open(io.BytesIO(content)) as img:
            img.verify()  # `verify` is cheap; it doesn't decode pixel data.
            actual_format = (img.format or "").lower()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Corrupted or unsupported image: {exc}") from exc

    fmt_to_mime = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
    canonical = fmt_to_mime.get(actual_format)
    if canonical is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format: {actual_format or 'unknown'}",
        )

    # Reject extension/MIME spoofing — the declared and actual formats must agree.
    if declared_mime not in {canonical, "image/jpg" if canonical == "image/jpeg" else None}:
        # Allow the common `image/jpg` alias for `image/jpeg` only.
        if not (declared_mime == "image/jpg" and canonical == "image/jpeg"):
            raise HTTPException(
                status_code=400,
                detail=f"Declared content-type {declared_mime} doesn't match actual format {canonical}",
            )
    return canonical


def _validate_extension(filename: str | None) -> None:
    if not filename:
        return
    ext = os.path.splitext(filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension: {ext or 'none'}. Allowed: .jpg, .jpeg, .png, .webp",
        )


@router.post(
    "/upload-picture",
    response_model=UploadPictureResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_profile_picture(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadPictureResponse:
    declared_mime = _normalize_mime(file.content_type)
    if declared_mime is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type: {file.content_type}. Allowed: {sorted(ALLOWED_MIME)}",
        )
    _validate_extension(file.filename)

    # Stream-read with a hard cap. We don't trust the Content-Length header.
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_PROFILE_PICTURE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Profile picture too large (max {MAX_PROFILE_PICTURE_BYTES // (1024 * 1024)} MiB)",
            )
        chunks.append(chunk)
    content = b"".join(chunks)

    if not content:
        raise HTTPException(status_code=400, detail="Empty file upload")

    canonical_mime = _validate_image_bytes(content, declared_mime=declared_mime)

    backend = get_backend()
    try:
        url = backend.upload(user_id=int(current_user.id), content=content, mime=canonical_mime)
    except Exception as exc:
        logger.exception("Profile picture upload to %s backend failed", backend.backend_name)
        raise HTTPException(status_code=502, detail="Storage backend unavailable, try again later") from exc

    # If the local backend handed back a relative path, promote it to an
    # absolute URL using the request's host so the kiosk can fetch it.
    absolute_url = to_absolute_url(url, base_url=str(request.base_url))

    # Best-effort: delete the previous blob/file. We only do this AFTER
    # the new URL is committed so a failed delete never loses the avatar.
    previous = current_user.profile_picture_url

    # Naive UTC, matches the rest of the schema (tos_accepted_at etc.).
    now = datetime.utcnow()
    current_user.profile_picture_url = absolute_url
    current_user.profile_picture_updated_at = now
    db.commit()
    db.refresh(current_user)

    if previous and previous != absolute_url:
        try:
            backend.delete(previous)
        except Exception:  # pragma: no cover - best-effort
            logger.debug("Failed to delete previous profile picture", exc_info=True)

    return UploadPictureResponse(
        success=True,
        profile_picture_url=absolute_url,
        profile_picture_updated_at=now,
    )


# ---------------------------------------------------------------------------
# DELETE /api/profile/picture
# ---------------------------------------------------------------------------


@router.delete("/picture", status_code=status.HTTP_200_OK)
def delete_profile_picture(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Remove the user's profile picture (blob + DB).

    Returns ``{"success": true}`` either way — deleting an already-absent
    picture is idempotent so the kiosk doesn't have to special-case it.
    """
    previous = current_user.profile_picture_url
    if previous:
        try:
            get_backend().delete(previous)
        except Exception:  # pragma: no cover - best-effort
            logger.debug("Failed to delete profile picture blob", exc_info=True)

    current_user.profile_picture_url = None
    current_user.profile_picture_updated_at = None
    db.commit()
    return {"success": True}
