import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import (
    RegisterIn,  # reuse schema
    _normalize_password,
    ph,
    require_role,
)
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.models import User

router = APIRouter()


@router.get("/", response_model=list[dict])
def list_users(
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    from app.models import UserOffer

    users = scoped_query(db, User, ctx).order_by(User.id.asc()).all()
    out = []
    for u in users:
        # Calculate total hours remaining from UserOffers
        offers = db.query(UserOffer).filter_by(user_id=u.id).all()
        total_hours = sum(max(0.0, uo.hours_remaining or 0.0) for uo in offers)
        
        out.append(
            {
                "id": u.id,
                "username": u.name,
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "phone": u.phone,
                "wallet_balance": u.wallet_balance or 0.0,
                "coins_balance": getattr(u, 'coins_balance', 0) or 0,
                "time_remaining_hours": round(total_hours, 2),
                "account_balance": u.wallet_balance or 0.0,
                "user_group": None,
                "start_date": None,
                "end_date": None,
            }
        )
    return out


@router.post("/create")
def create_user(
    payload: RegisterIn,
    request: Request,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Create a new user (admin only)."""
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    normalized = _normalize_password(payload.password)
    hashed = ph.hash(normalized)
    bd = None
    if payload.birthdate:
        try:
            bd = datetime.strptime(payload.birthdate, "%d/%m/%Y")
        except Exception:
            try:
                bd = datetime.fromisoformat(payload.birthdate)
            except Exception:
                bd = None
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hashed,
        role=payload.role or "client",
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        birthdate=bd,
        is_email_verified=True,
        cafe_id=ctx.cafe_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Audit log user creation
    try:
        log_action(
            db,
            current_user.id,
            "user_create",
            f"Created user:{user.id} email:{user.email} role:{user.role}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass  # Don't fail if audit logging fails

    return {"ok": True, "id": user.id}


@router.get("/export")
def export_users(
    request: Request,
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    users = scoped_query(db, User, ctx).order_by(User.id.asc()).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["username", "email", "role", "first_name", "last_name", "phone"])
    for u in users:
        writer.writerow(
            [
                u.name or "",
                u.email or "",
                u.role or "client",
                u.first_name or "",
                u.last_name or "",
                u.phone or "",
            ]
        )
    buf.seek(0)

    # Audit log user export
    try:
        log_action(
            db,
            current_user.id,
            "user_export",
            f"Exported {len(users)} users",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass  # Don't fail if audit logging fails

    return StreamingResponse(
        iter([buf.read()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.post("/import")
def import_users(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    import os
    import re

    MAX_CSV_SIZE_BYTES = int(os.getenv("MAX_CSV_SIZE_BYTES", str(5 * 1024 * 1024)))  # 5MB default
    MAX_CSV_ROWS = int(os.getenv("MAX_CSV_ROWS", "1000"))

    # Validate file size
    content_bytes = file.file.read()
    if len(content_bytes) > MAX_CSV_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_CSV_SIZE_BYTES / 1024 / 1024:.1f}MB",
        )

    # Decode content
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        # Preserve original decoding error context
        raise HTTPException(status_code=400, detail="Invalid file encoding. Must be UTF-8") from exc

    # Parse CSV
    reader = csv.DictReader(io.StringIO(content))
    created = 0
    errors: list[str] = []
    row_count = 0

    def sanitize_csv_cell(cell: str) -> str:
        """Prevent CSV injection by prefixing dangerous characters with single quote."""
        if cell and cell.strip().startswith(("=", "+", "-", "@")):
            return "'" + cell
        return cell

    def validate_email(email: str) -> bool:
        """Validate email format."""
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(pattern, email))

    for i, row in enumerate(reader, start=2):
        row_count += 1
        if row_count > MAX_CSV_ROWS:
            errors.append(f"Maximum {MAX_CSV_ROWS} rows allowed. Stopping import.")
            break

        try:
            name = sanitize_csv_cell((row.get("username") or row.get("name") or "").strip())
            email = sanitize_csv_cell((row.get("email") or "").strip())
            password = (row.get("password") or "").strip()

            # Validate required fields
            if not email or not password or not name:
                errors.append(f"row {i}: missing username/email/password")
                continue

            # Validate email format
            if not validate_email(email):
                errors.append(f"row {i}: invalid email format: {email}")
                continue

            # Check if user already exists
            if db.query(User).filter(User.email == email).first():
                errors.append(f"row {i}: email already exists: {email}")
                continue

            # Validate password length
            if len(password) < 6:
                errors.append(f"row {i}: password too short (minimum 6 characters)")
                continue

            # Create user with Argon2id-hashed password (normalized for consistency)
            normalized = _normalize_password(password)
            user = User(
                name=name,
                email=email,
                password_hash=ph.hash(normalized),
                role=(row.get("role") or "client").strip() or "client",
                first_name=sanitize_csv_cell((row.get("first_name") or "").strip()) or None,
                last_name=sanitize_csv_cell((row.get("last_name") or "").strip()) or None,
                phone=sanitize_csv_cell((row.get("phone") or "").strip()) or None,
                is_email_verified=False,  # Require email verification for imported users
                cafe_id=ctx.cafe_id,
            )
            db.add(user)
            created += 1
        except Exception as e:
            errors.append(f"row {i}: {str(e)}")

    db.commit()

    # Audit log user import
    try:
        log_action(
            db,
            current_user.id,
            "user_import",
            f"Imported {created} users, {len(errors)} errors",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass  # Don't fail if audit logging fails

    return {"created": created, "errors": errors}
