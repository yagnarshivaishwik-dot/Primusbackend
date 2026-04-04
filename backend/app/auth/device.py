"""Device validation dependency for per-request device binding enforcement."""

import ipaddress
import logging
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth.context import AuthContext, get_auth_context
from app.db.dependencies import get_global_db as get_db
from app.models import ClientPC, DeviceIpHistory

logger = logging.getLogger(__name__)


def validate_device(
    request: Request,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> ClientPC | None:
    """Validate device on every request. Checks status, cafe match, IP whitelist.

    Returns the ClientPC record, or None if no device_id in token (web login).
    """
    if ctx.device_id is None:
        return None  # Web admin sessions skip device validation

    pc = db.query(ClientPC).filter(ClientPC.device_id == ctx.device_id).first()
    if pc is None:
        raise HTTPException(status_code=403, detail="Device not registered")

    device_status = getattr(pc, "device_status", "active") or "active"
    if device_status == "revoked":
        raise HTTPException(status_code=403, detail="Device has been revoked")
    if device_status == "pending":
        raise HTTPException(status_code=403, detail="Device pending approval")

    # Validate cafe matches JWT
    if pc.cafe_id != ctx.cafe_id and not ctx.is_superadmin:
        logger.warning(
            "Device cafe mismatch: device=%s jwt_cafe=%s pc_cafe=%s",
            ctx.device_id, ctx.cafe_id, pc.cafe_id,
        )
        raise HTTPException(status_code=403, detail="Device does not belong to authenticated cafe")

    # IP whitelist check
    from app.config import ENFORCE_IP_WHITELIST
    client_ip = request.client.host if request.client else None

    if ENFORCE_IP_WHITELIST and client_ip and pc.allowed_ip_range:
        if not _ip_in_range(client_ip, pc.allowed_ip_range):
            logger.warning(
                "IP not in whitelist: device=%s ip=%s range=%s",
                ctx.device_id, client_ip, pc.allowed_ip_range,
            )
            raise HTTPException(status_code=403, detail="Request IP not in device whitelist")

    # Record IP history asynchronously (best-effort)
    if client_ip:
        try:
            _record_ip(db, pc.id, client_ip)
        except Exception:
            pass  # Non-fatal

    return pc


def _ip_in_range(ip: str, cidr: str) -> bool:
    """Check if an IP address is within a CIDR range."""
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        logger.warning("Invalid CIDR %r, allowing request", cidr)
        return True  # Permissive on invalid CIDR config


def _record_ip(db: Session, pc_id: int, ip: str) -> None:
    """Upsert IP address into device_ip_history."""
    existing = (
        db.query(DeviceIpHistory)
        .filter(DeviceIpHistory.client_pc_id == pc_id, DeviceIpHistory.ip_address == ip)
        .first()
    )
    if existing:
        existing.last_seen = datetime.now(UTC)
        existing.request_count = (existing.request_count or 0) + 1
    else:
        db.add(DeviceIpHistory(
            client_pc_id=pc_id,
            ip_address=ip,
            first_seen=datetime.now(UTC),
            last_seen=datetime.now(UTC),
            request_count=1,
        ))
    db.commit()
