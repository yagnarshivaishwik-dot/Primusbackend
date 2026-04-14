import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import get_current_user, require_role
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db, get_global_db
from app.db.global_db import global_session_factory
from app.db.router import cafe_db_router

# License lives in the GLOBAL database in both single-DB and multi-DB
# mode (the user's global DB schema matches app.models.License). Always
# import it from the legacy models module.
from app.models import License

# ClientPC and SystemEvent live in per-cafe databases when MULTI_DB_ENABLED
# is true. The cafe-scoped schema does NOT have a `cafe_id` column (each
# database IS a cafe). We pick the right model class at module load so the
# rest of the file can refer to ClientPC / SystemEvent without aliasing.
if MULTI_DB_ENABLED:
    from app.db.models_cafe import ClientPC, SystemEvent
else:
    from app.models import ClientPC, SystemEvent  # type: ignore[no-redef]
from app.schemas import ClientPCCreate, ClientPCOut
from app.utils.cache import publish_invalidation
from app.utils.license import is_signed_key, verify_signed_license
from app.utils.security import verify_device_signature
from app.ws.admin import broadcast_admin
from app.ws.auth import build_event
import json

router = APIRouter()


# Dependency: Auth for Device Requests
async def get_current_device(request: Request, db: Session = Depends(get_db)):
    """
    MASTER SYSTEM: Authenticate and verify signature for device requests.
    """
    pc_id = request.headers.get("X-PC-ID")
    if not pc_id:
        # Fallback for heartbeat/pull where pc_id might be in URL
        # For now, we prefer header
        raise HTTPException(status_code=401, detail="X-PC-ID header required")

    pc = db.query(ClientPC).filter_by(id=int(pc_id)).first()
    if not pc or not pc.device_secret:
        raise HTTPException(status_code=401, detail="Device not registered or missing secret")

    # Verify Signature
    body = await request.body()
    verify_device_signature(request, body, pc.device_secret)

    return pc


# PC agent registers itself (idempotent via hardware fingerprint).
#
# Multi-DB note:
# This endpoint cannot use a single `Depends(get_db)` because the cafe_id is
# only known AFTER the License lookup. License lives in the GLOBAL database;
# ClientPC and SystemEvent live in the CAFE-SPECIFIC database (when
# MULTI_DB_ENABLED=true). The handler opens both sessions explicitly.
@router.post("/register", response_model=ClientPCOut)
async def register_pc(
    pc: ClientPCCreate,
    request: Request,
):
    """
    MASTER SYSTEM: Production-grade idempotent registration.
    Uses hardware fingerprint to ensure a PC always maps to the same record.
    """
    # ------------------------------------------------------------------
    # Step 1: License validation (always against the GLOBAL database)
    # ------------------------------------------------------------------
    if is_signed_key(pc.license_key):
        ok, err = verify_signed_license(pc.license_key)
        if not ok:
            if err == "not_signed":
                raise HTTPException(status_code=403, detail="Invalid license key format")
            raise HTTPException(status_code=403, detail=err)

    global_db = global_session_factory()
    try:
        license_obj = global_db.query(License).filter_by(key=pc.license_key).first()
        if not license_obj or not license_obj.is_active:
            raise HTTPException(status_code=403, detail="Invalid or inactive license")

        # For signed keys, also confirm the embedded cafe_id matches the DB record.
        if is_signed_key(pc.license_key):
            from app.utils.license import decode_signed_license_key
            claims = decode_signed_license_key(pc.license_key)
            if claims and claims.get("cafe_id") != license_obj.cafe_id:
                raise HTTPException(status_code=403, detail="License cafe mismatch")

        # Make expires_at timezone-aware if it's naive (for comparison with UTC)
        expires_at = license_obj.expires_at
        if expires_at:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at < datetime.now(UTC):
                raise HTTPException(status_code=403, detail="License expired")

        # Snapshot fields we need outside the global session scope
        cafe_id = license_obj.cafe_id
        license_key = license_obj.key
        license_max_pcs = license_obj.max_pcs
    finally:
        global_db.close()

    # ------------------------------------------------------------------
    # Step 2: ClientPC operations on the CAFE-SPECIFIC database
    # ------------------------------------------------------------------
    # In multi-DB mode, route to the cafe-specific database.
    # In single-DB mode, fall back to the global session (everything is
    # in one database anyway).
    if MULTI_DB_ENABLED:
        cafe_db = cafe_db_router.get_session(cafe_id)
    else:
        cafe_db = global_session_factory()

    try:
        # In multi-DB mode the cafe DB schema has no cafe_id column
        # (each database IS the cafe), so we filter on hardware_fingerprint
        # only. In single-DB mode we additionally scope by cafe_id to keep
        # the same behaviour as before.
        query = cafe_db.query(ClientPC).filter_by(
            hardware_fingerprint=pc.hardware_fingerprint
        )
        if not MULTI_DB_ENABLED:
            query = query.filter_by(cafe_id=cafe_id)
        pc_obj = query.first()

        if pc_obj:
            # Update metadata on existing record
            pc_obj.name = pc.name
            pc_obj.ip_address = str(request.client.host)
            pc_obj.last_seen = datetime.now(UTC)
            pc_obj.capabilities = pc.capabilities
            pc_obj.status = "online"
        else:
            # Check PC limit before creating
            existing_pcs = (
                cafe_db.query(ClientPC).filter_by(license_key=license_key).count()
            )
            if existing_pcs >= license_max_pcs:
                raise HTTPException(
                    status_code=403,
                    detail="Max PC count reached for this license",
                )

            _raw_secret = secrets.token_urlsafe(32)
            pc_kwargs = dict(
                license_key=license_key,
                name=pc.name,
                hardware_fingerprint=pc.hardware_fingerprint,
                device_secret=_raw_secret,  # Legacy cleartext; kept for HMAC compat
                device_secret_hash=hashlib.sha256(_raw_secret.encode()).hexdigest(),
                device_status="active",
                ip_address=str(request.client.host),
                status="online",
                last_seen=datetime.now(UTC),
                capabilities=pc.capabilities,
                bound=True,
                bound_at=datetime.now(UTC),
            )
            # Only set cafe_id in single-DB mode (legacy schema has the column)
            if not MULTI_DB_ENABLED:
                pc_kwargs["cafe_id"] = cafe_id
            pc_obj = ClientPC(**pc_kwargs)
            cafe_db.add(pc_obj)

        cafe_db.commit()
        cafe_db.refresh(pc_obj)

        # Emit event for Admin UI. In multi-DB mode SystemEvent has no
        # cafe_id either, so build kwargs conditionally.
        event_kwargs = dict(
            type="pc.status",
            pc_id=pc_obj.id,
            payload={"name": pc_obj.name, "status": "online", "event": "registered"},
        )
        if not MULTI_DB_ENABLED:
            event_kwargs["cafe_id"] = cafe_id
        event = SystemEvent(**event_kwargs)
        cafe_db.add(event)
        cafe_db.commit()

        # Snapshot fields for the response BEFORE closing the session
        result = {
            "id": pc_obj.id,
            "name": pc_obj.name,
            "status": pc_obj.status,
            "cafe_id": cafe_id,  # always include in response, even if not on the row
            "device_secret": pc_obj.device_secret,  # CRITICAL: Returned once
            "license_key": pc_obj.license_key,
        }
    finally:
        cafe_db.close()

    return result


# PC agent sends heartbeat (keep status up to date)
@router.post("/heartbeat")
async def pc_heartbeat(
    request: Request, pc: ClientPC = Depends(get_current_device), db: Session = Depends(get_db)
):
    if pc.suspended:
        raise HTTPException(status_code=403, detail="PC suspended")

    prev_status = pc.status
    pc.last_seen = datetime.now(UTC)
    pc.ip_address = str(request.client.host)
    pc.status = "online"  # Heartbeat means it's online

    db.commit()

    # Emit event if status changed
    if prev_status != "online":
        _resolved_cafe = getattr(pc, "cafe_id", None)
        event_kwargs = dict(type="pc.status", pc_id=pc.id, payload={"status": "online"})
        if _resolved_cafe is not None:
            event_kwargs["cafe_id"] = _resolved_cafe
        event = SystemEvent(**event_kwargs)
        db.add(event)
        db.commit()

        # Invalidate Redis cache
        try:
            await publish_invalidation({
                "scope": "client_pc",
                "items": [{"type": "client_pc_list", "id": "*"}]
            })
        except Exception:
            pass

        # Broadcast to admin WebSocket
        status_payload = {
            "client_id": pc.id,
            "online": True,
            "user_name": str(pc.current_user_id) if pc.current_user_id else "Guest",
            "hostname": pc.name
        }
        try:
            await broadcast_admin(
                json.dumps(build_event("pc.status.update", status_payload)),
                cafe_id=_resolved_cafe,
            )
        except Exception:
            pass

    return {"status": "ok", "server_time": datetime.now(UTC).isoformat()}


# Simple heartbeat with pc_id as path parameter (SECURED with signature)
@router.post("/heartbeat/{pc_id}")
async def pc_heartbeat_simple(
    pc_id: int, request: Request, db: Session = Depends(get_db)
):
    """
    Heartbeat endpoint for native clients.
    SECURITY: Requires X-Signature header for authentication.
    """
    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")

    if pc.suspended:
        raise HTTPException(status_code=403, detail="PC suspended")

    # SECURITY: Verify signature to prevent spoofing
    signature = request.headers.get("X-Signature")
    timestamp = request.headers.get("X-Timestamp")
    
    if not signature or not timestamp:
        raise HTTPException(
            status_code=401, 
            detail="Missing authentication headers. Use signed heartbeat."
        )
    
    # Verify timestamp is recent (5 minute window)
    import time
    import hmac
    import hashlib
    
    try:
        ts_int = int(timestamp)
        now = int(time.time())
        if abs(now - ts_int) > 300:
            raise HTTPException(status_code=401, detail="Request expired")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp")
    
    # Verify HMAC signature
    if pc.device_secret:
        body = await request.body()
        message = f"{timestamp}".encode() + body
        expected_sig = hmac.new(
            pc.device_secret.encode(), message, hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            raise HTTPException(status_code=401, detail="Invalid signature")

    prev_status = pc.status
    pc.last_seen = datetime.now(UTC)
    pc.ip_address = str(request.client.host) if request.client else None
    pc.status = "online"

    db.commit()

    # Emit event if status changed
    if prev_status != "online":
        _resolved_cafe = getattr(pc, "cafe_id", None)
        event_kwargs = dict(type="pc.status", pc_id=pc.id, payload={"status": "online"})
        if _resolved_cafe is not None:
            event_kwargs["cafe_id"] = _resolved_cafe
        event = SystemEvent(**event_kwargs)
        db.add(event)
        db.commit()

        # 1. Invalidate Redis Cache instantly
        try:
            await publish_invalidation({
                "scope": "client_pc",
                "items": [{"type": "client_pc_list", "id": "*"}]
            })
        except Exception:
            pass

        # 2. Push Real-Time WebSocket Update to Admin Portal
        status_payload = {
            "client_id": pc.id,
            "online": True,
            "user_name": str(pc.current_user_id) if pc.current_user_id else "Guest",
            "hostname": pc.name
        }
        try:
            await broadcast_admin(
                json.dumps(build_event("pc.status.update", status_payload)),
                cafe_id=_resolved_cafe,
            )
        except Exception:
            pass

    return {"status": "ok", "server_time": datetime.now(UTC).isoformat()}


@router.post("/rebind/{pc_id}")
async def rebind_pc(
    pc_id: int,
    request: Request,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    def _rebind() -> None:
        pc = db.query(ClientPC).filter_by(id=pc_id).first()
        if not pc:
            raise HTTPException(status_code=404, detail="PC not found")
        dev_id = request.headers.get("X-Device-Id") or request.headers.get("X-Machine-Id")
        if not dev_id:
            raise HTTPException(status_code=400, detail="Missing device id header")
        pc.device_id = dev_id
        pc.bound = True
        pc.bound_at = datetime.utcnow()
        pc.grace_until = datetime.utcnow() + timedelta(days=3)
        db.commit()

    await run_in_threadpool(_rebind)

    await publish_invalidation(
        {
            "scope": "client_pc",
            "items": [
                {"type": "client_pc_list", "id": "*"},
            ],
        }
    )

    return {"status": "rebound"}


# List all registered PCs for the current cafe.
@router.get("/")
async def list_pcs(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    MASTER SYSTEM: Multi-tenancy isolation for PC list.
    Returns basic PC data for fast loading.

    In multi-DB mode the per-cafe database only ever contains rows for
    that cafe, so we don't filter by cafe_id (the column doesn't exist).
    The dependency `get_db` (=get_cafe_db) routes us to the correct
    cafe_db based on the JWT's cafe_id claim, which gives us the
    isolation guarantee for free.

    In single-DB mode we still filter explicitly by cafe_id since the
    legacy schema has it.
    """
    if not current_user.cafe_id:
        if current_user.role == "superadmin":
            pcs = db.query(ClientPC).all()
        else:
            return []
    elif MULTI_DB_ENABLED:
        # Cafe DB is already scoped — no cafe_id column to filter on
        pcs = db.query(ClientPC).all()
    else:
        pcs = db.query(ClientPC).filter_by(cafe_id=current_user.cafe_id).all()

    # Return basic data for fast loading
    result = []
    for pc in pcs:
        result.append({
            "id": pc.id,
            "name": pc.name,
            "status": pc.status,
            "ip_address": pc.ip_address,
            "last_seen": pc.last_seen.isoformat() if pc.last_seen else None,
            "cafe_id": getattr(pc, "cafe_id", current_user.cafe_id),
            "capabilities": pc.capabilities,
            "current_user_id": pc.current_user_id,
            "user_name": None,
            "session_start": None,
            "remaining_time": None
        })

    return result


@router.delete("/{pc_id}")
async def delete_pc(
    pc_id: int,
    current_user=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    """
    Remove a PC from the registry.
    """
    # Re-import in this scope. In multi-DB mode SystemEvent comes from
    # the cafe-scoped models module to match the cafe DB schema.
    if MULTI_DB_ENABLED:
        from app.db.models_cafe import SystemEvent as _SystemEvent
        # RemoteCommand and PCSession are also cafe-scoped
        from app.db.models_cafe import RemoteCommand
        from app.db.models_cafe import Session as PCSession
    else:
        from app.models import RemoteCommand, SystemEvent as _SystemEvent  # noqa: F401
        from app.models import Session as PCSession  # noqa: F401
    SystemEvent = _SystemEvent  # noqa: F811 — local rebind for downstream code below

    pc = db.query(ClientPC).filter_by(id=pc_id).first()
    if not pc:
        raise HTTPException(status_code=404, detail="PC not found")

    # Superadmin can delete any. In multi-DB mode the cafe DB router
    # already enforces tenant isolation (only PCs in the user's cafe DB
    # are visible), so the cafe_id ownership check is redundant. In
    # single-DB mode the legacy schema has cafe_id and we still check.
    if not MULTI_DB_ENABLED and current_user.role != "superadmin":
        if getattr(pc, "cafe_id", None) != current_user.cafe_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this PC")

    # Manual Cascade Delete to satisfy Foreign Keys
    # 1. System Events
    db.query(SystemEvent).filter(SystemEvent.pc_id == pc.id).delete()
    
    # 2. Remote Commands
    db.query(RemoteCommand).filter(RemoteCommand.pc_id == pc.id).delete()

    # 3. Sessions — nullify the PC FK to preserve financial history.
    # The legacy global Session model uses `client_pc_id` to reference
    # client_pcs.id, but the cafe-scoped models_cafe.Session uses `pc_id`
    # (each per-cafe DB has only one PCs table). Pick the right column
    # based on which model is in scope.
    if MULTI_DB_ENABLED:
        db.query(PCSession).filter(PCSession.pc_id == pc.id).update(
            {PCSession.pc_id: None}
        )
    else:
        db.query(PCSession).filter(PCSession.client_pc_id == pc.id).update(
            {PCSession.client_pc_id: None}
        )

    # Finally, delete the PC
    db.delete(pc)
    db.commit()

    # Invalidate cache
    await publish_invalidation(
        {
            "scope": "client_pc",
            "items": [{"type": "client_pc_list", "id": "*"}],
        }
    )

    return {"status": "deleted"}


def enforce_license(license_obj: License, db: Session):
    if not license_obj.is_active:
        raise HTTPException(status_code=403, detail="License is revoked")
    if license_obj.expires_at:
        expires_at = license_obj.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at < datetime.now(UTC):
            raise HTTPException(status_code=403, detail="License is expired")
    pc_count = db.query(ClientPC).filter_by(license_key=license_obj.key).count()
    if pc_count > license_obj.max_pcs:
        raise HTTPException(status_code=403, detail="License max PC count exceeded")
