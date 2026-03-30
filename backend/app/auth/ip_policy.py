"""IP policy utilities: CIDR matching, IP history recording, anomaly detection."""

import ipaddress
import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import DeviceIpHistory

logger = logging.getLogger(__name__)


def ip_in_cidr(ip: str, cidr: str) -> bool:
    """Check if an IP address is within a CIDR range. Returns True on invalid CIDR."""
    try:
        return ipaddress.ip_address(ip) in ipaddress.ip_network(cidr, strict=False)
    except ValueError:
        logger.warning("Invalid CIDR notation %r during IP check", cidr)
        return True  # Permissive on misconfiguration


def record_ip(db: Session, pc_id: int, ip: str) -> DeviceIpHistory:
    """Upsert an IP address record for a device. Returns the record."""
    existing = (
        db.query(DeviceIpHistory)
        .filter(DeviceIpHistory.client_pc_id == pc_id, DeviceIpHistory.ip_address == ip)
        .first()
    )
    if existing:
        existing.last_seen = datetime.now(UTC)
        existing.request_count = (existing.request_count or 0) + 1
        db.commit()
        return existing

    entry = DeviceIpHistory(
        client_pc_id=pc_id,
        ip_address=ip,
        first_seen=datetime.now(UTC),
        last_seen=datetime.now(UTC),
        request_count=1,
    )
    db.add(entry)
    db.commit()
    return entry


def detect_suspicious_ip(db: Session, pc_id: int, current_ip: str) -> bool:
    """Return True if current_ip has never been seen for this device.

    Used for anomaly detection — a never-before-seen IP may indicate theft.
    """
    recent = (
        db.query(DeviceIpHistory)
        .filter(DeviceIpHistory.client_pc_id == pc_id)
        .order_by(DeviceIpHistory.last_seen.desc())
        .limit(10)
        .all()
    )
    if not recent:
        return False  # No history yet — first connection, not suspicious

    known_ips = {r.ip_address for r in recent}
    if current_ip not in known_ips:
        logger.warning(
            "Suspicious IP change for PC %d: new=%s known=%s",
            pc_id, current_ip, known_ips,
        )
        return True
    return False
