import hashlib
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user, require_role
from app.database import get_db
from app.models import PC, Screenshot

router = APIRouter()
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./screenshots")
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]
ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"]

os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_file_extension(filename: str) -> str:
    """Get file extension from filename."""
    return Path(filename).suffix.lower()


def _validate_file_type(content: bytes, filename: str) -> bool:
    """Validate file type by extension and content."""
    ext = _get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False

    # Basic content validation - check magic bytes
    if len(content) < 4:
        return False

    # PNG: 89 50 4E 47
    if content[:4] == b"\x89PNG":
        return ext in [".png"]
    # JPEG: FF D8 FF
    if content[:3] == b"\xff\xd8\xff":
        return ext in [".jpg", ".jpeg"]
    # WebP: RIFF...WEBP
    if content[:4] == b"RIFF" and b"WEBP" in content[:12]:
        return ext == ".webp"

    return False


def _fingerprint_content(content: bytes) -> str:
    """
    Return a short, non-sensitive fingerprint for screenshot content.

    This uses SHA-256 and keeps only the first 8 hex characters. The value is
    used purely to make filenames more unique and is NOT used for any security
    decision.
    """

    return hashlib.sha256(content).hexdigest()[:8]


# PC posts a screenshot
@router.post("/upload/{pc_id}")
async def upload_screenshot(
    pc_id: int,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413, detail=f"File too large. Maximum size: {MAX_FILE_SIZE_MB}MB"
        )

    # Validate file type
    if not _validate_file_type(content, file.filename or ""):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Generate safe filename: pc_id-timestamp-hash.ext
    from datetime import UTC

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    # Use SHA‑256 for file fingerprinting instead of SHA‑1 (Bandit B324).
    file_hash = _fingerprint_content(content)
    ext = _get_file_extension(file.filename or ".png")
    if not ext:
        ext = ".png"  # Default to PNG if no extension

    filename = f"{pc_id}_{timestamp}_{file_hash}{ext}"
    # Sanitize filename to prevent path traversal - explicit validation
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filename = os.path.basename(filename)

    # Ensure upload directory is absolute and within project
    upload_dir = os.path.abspath(UPLOAD_DIR)
    filepath = os.path.join(upload_dir, filename)

    # Additional path traversal check
    if not filepath.startswith(os.path.abspath(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")

    # Ensure directory exists
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    # Write file
    with open(filepath, "wb") as f:
        f.write(content)

    ss = Screenshot(
        pc_id=pc_id,
        image_url=filepath,
        timestamp=datetime.now(UTC),
        taken_by=current_user.id,
    )
    db.add(ss)
    db.commit()
    db.refresh(ss)
    return {"image_url": filepath}


# Admin: List latest screenshots per PC
@router.get("/latest", tags=["screenshot"])
def latest_screenshots(current_user=Depends(require_role("admin")), db: Session = Depends(get_db)):
    pcs = db.query(PC).all()
    results = []
    for pc in pcs:
        ss = (
            db.query(Screenshot)
            .filter_by(pc_id=pc.id)
            .order_by(Screenshot.timestamp.desc())
            .first()
        )
        if ss:
            results.append({"pc_id": pc.id, "image_url": ss.image_url, "timestamp": ss.timestamp})
    return results
