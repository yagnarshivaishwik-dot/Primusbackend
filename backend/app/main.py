import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from app.api.endpoints import (
    admin_events,
    announcement,
    audit,
    auth,
    backup,
    billing,
    booking,
    cafe,
    chat,
    client_pc,
    coupon,
    event,
    game,
    games,
    hardware,
    internal_auth,
    internal_dashboard,
    internal_health,
    leaderboard,
    license,
    membership,
    notification,
    offer,
    payment,
    pc,
    pc_admin,
    pc_ban,
    pc_group,
    prize,
    remote_command,
    screenshot,
    security_utils,
    session,
    settings,
    shop,
    social_auth,
    staff,
    stats,
    support_ticket,
    system_control,
    update,
    user,
    user_group,
    wallet,
    webhook,
)
from app.middleware.csrf import CSRFProtectionMiddleware
from app.middleware.security import (
    RateLimitMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.tasks.presence import presence_monitor_loop
from app.tasks.timeleft_broadcast import _broadcast_timeleft_loop
from app.utils.cache import (
    close_redis_client,
    init_redis_client,
    subscribe_invalidation_loop,
)
from app.ws import admin as ws_admin
from app.ws import pc as ws_pc
from otp_email import send_otp_email
from verify_otp import router as otp_router

try:
    from prometheus_client import make_asgi_app as _make_prometheus_app
except Exception:  # pragma: no cover
    _make_prometheus_app = None

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context.

    Starts background tasks (e.g., time-left broadcast loop) on startup
    and can be extended later for graceful shutdown if needed.
    """
    try:
        asyncio.create_task(_broadcast_timeleft_loop())
        asyncio.create_task(presence_monitor_loop())
    except Exception as e:
        logging.error(f"Failed to start background task: {e}")

    try:
        await init_redis_client()
        asyncio.create_task(subscribe_invalidation_loop())
    except Exception as e:  # pragma: no cover - startup failures should not crash app
        logging.error(f"Failed to initialize Redis caching: {e}")

    yield
    try:
        await close_redis_client()
    except Exception as e:  # pragma: no cover
        logging.error(f"Failed to close Redis client: {e}")


# Load environment from .env if present
try:
    load_dotenv()
except Exception:
    pass

# Database initialization
# NOTE: For all environments, use Alembic migrations instead of create_all()
# Run: alembic upgrade head
is_production = os.getenv("ENVIRONMENT", "").lower() == "production"

if not is_production:
    # In development, log a reminder but still require explicit Alembic migrations.
    logging.getLogger(__name__).warning(
        "Primus is PostgreSQL-only. Ensure database migrations are applied using: "
        "alembic upgrade head"
    )
else:
    # In production, be explicit about requiring Alembic.
    import warnings

    warnings.warn(
        "Running in production. Ensure database migrations are applied using: alembic upgrade head",
        UserWarning,
        stacklevel=2,
    )

app = FastAPI(lifespan=lifespan)

# CSRF protection middleware (applied first, before other middleware)
csrf_enabled = os.getenv("ENABLE_CSRF_PROTECTION", "true").lower() == "true"
app.add_middleware(CSRFProtectionMiddleware, enabled=csrf_enabled)

# Security headers middleware (applied to all responses)
app.add_middleware(SecurityHeadersMiddleware)

# Rate limiting middleware - set high to avoid blocking legitimate admin usage
rate_limit_rpm = int(os.getenv("RATE_LIMIT_PER_MINUTE", "1000"))
rate_limit_burst = int(os.getenv("RATE_LIMIT_BURST", "100"))
app.add_middleware(RateLimitMiddleware, requests_per_minute=rate_limit_rpm, burst=rate_limit_burst)

# Request size limit middleware
max_request_size = int(os.getenv("MAX_REQUEST_SIZE_BYTES", str(10 * 1024 * 1024)))  # 10MB default
app.add_middleware(RequestSizeLimitMiddleware, max_size_bytes=max_request_size)

# CORS configuration
origins = [
    "https://primustech.in",  # Production frontend
    "https://www.primustech.in",  # Production frontend (www)
    "https://primusadmin.in",  # Primus admin portal
    "https://www.primusadmin.in",  # Admin portal (www)
    "https://api.primusadmin.in",  # Admin portal API subdomain
    "https://api.primustech.in",  # API subdomain
    "https://primusinfotech.com",  # Marketing site (.com)
    "https://www.primusinfotech.com",  # Marketing site (.com www)
    "http://localhost:5173",  # Vite dev server
    "http://127.0.0.1:5173",  # Vite dev server (IP)
    "http://localhost:3000",  # Alternative dev port
    "http://127.0.0.1:3000",  # Alternative dev port (IP)
    "http://localhost:1420",  # Tauri app dev
    "http://127.0.0.1:1420",  # Tauri app dev (IP)
    "tauri://localhost",  # Tauri app production
]

# FOR DEVELOPMENT ONLY: allow all origins when ALLOW_ALL_CORS=true
# Never allow in production - this is a security risk
allow_all_cors = os.getenv("ALLOW_ALL_CORS", "false").lower() == "true"
environment = os.getenv("ENVIRONMENT", "").lower()

# Fail-fast if ALLOW_ALL_CORS is enabled in production
if allow_all_cors and is_production:
    raise ValueError("ALLOW_ALL_CORS cannot be true in production. This is a security risk.")

# Allow CORS wildcard only in development
if allow_all_cors and not is_production:
    # When allow_credentials=True, Starlette disallows wildcard origins; use regex instead
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )
else:
    # Use explicit allowlist from environment or defaults
    allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
    if allowed_origins_env:
        origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

    # In production, ALLOWED_ORIGINS must be explicit and must not contain wildcards.
    if is_production:
        if not origins:
            raise ValueError(
                "In production, ALLOWED_ORIGINS must be set to one or more explicit origins."
            )
        if any(o == "*" for o in origins):
            raise ValueError("Wildcard '*' is not allowed in ALLOWED_ORIGINS for production.")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


@app.middleware("http")
async def json_logging_middleware(request: Request, call_next):
    """
    Emit a structured JSON log for each request/response.
    """
    request_id = str(uuid.uuid4())
    start = datetime.now(UTC)
    response = await call_next(request)
    duration_ms = (datetime.now(UTC) - start).total_seconds() * 1000

    log_record = {
        "ts": start.isoformat(),
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": duration_ms,
        "client_ip": str(request.client.host) if request.client else None,
    }
    logging.getLogger("primus.request").info(json.dumps(log_record, separators=(",", ":")))
    return response


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(pc.router, prefix="/api/pc", tags=["pc"])
app.include_router(session.router, prefix="/api/session", tags=["session"])
app.include_router(wallet.router, prefix="/api/wallet", tags=["wallet"])
app.include_router(game.router, prefix="/api/game", tags=["game"])
app.include_router(remote_command.router, prefix="/api/command", tags=["remote_command"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(notification.router, prefix="/api/notification", tags=["notification"])
app.include_router(support_ticket.router, prefix="/api/support", tags=["support"])
app.include_router(announcement.router, prefix="/api/announcement", tags=["announcement"])
app.include_router(hardware.router, prefix="/api/hardware", tags=["hardware"])
app.include_router(update.router, prefix="/api/update", tags=["update"])
app.include_router(license.router, prefix="/api/license", tags=["license"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(pc_ban.router, prefix="/api/pcban", tags=["pcban"])
app.include_router(pc_group.router, prefix="/api/pcgroup", tags=["pcgroup"])
app.include_router(backup.router, prefix="/api/backup", tags=["backup"])
app.include_router(billing.router, prefix="/api/billing", tags=["billing"])
app.include_router(webhook.router, prefix="/api/webhook", tags=["webhook"])
app.include_router(security_utils.router, prefix="/api/security", tags=["security"])
app.include_router(social_auth.router, prefix="/api/social", tags=["social"])
app.include_router(membership.router, prefix="/api/membership", tags=["membership"])
app.include_router(booking.router, prefix="/api/booking", tags=["booking"])
app.include_router(screenshot.router, prefix="/api/screenshot", tags=["screenshot"])
app.include_router(pc_admin.router, prefix="/api/pcadmin", tags=["pcadmin"])
app.include_router(cafe.router, prefix="/api/cafe", tags=["cafe"])
# license router already included above
app.include_router(client_pc.router, prefix="/api/clientpc", tags=["clientpc"])
app.include_router(staff.router, prefix="/api/staff", tags=["staff"])
app.include_router(offer.router, prefix="/api/offer", tags=["offer"])
app.include_router(user_group.router, prefix="/api/usergroup", tags=["usergroup"])
app.include_router(payment.router, prefix="/api/payment", tags=["payment"])
app.include_router(prize.router, prefix="/api/prize", tags=["prize"])
app.include_router(user.router, prefix="/api/user", tags=["user"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["leaderboard"])
app.include_router(event.router, prefix="/api/event", tags=["event"])
app.include_router(coupon.router, prefix="/api/coupon", tags=["coupon"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(games.router, prefix="/api/games", tags=["games"])
app.include_router(shop.router, prefix="/api/v1/shop", tags=["shop"])
app.include_router(shop.router, prefix="/api/shop", tags=["shop"])  # Also mount at /api/shop for client compatibility
app.include_router(admin_events.router, prefix="/api/admin/events", tags=["events"])

# Internal SuperAdmin routes
app.include_router(internal_auth.router, prefix="/api/internal/auth", tags=["internal"])
app.include_router(internal_dashboard.router, prefix="/api/internal", tags=["internal"])
app.include_router(internal_health.router, prefix="/api/internal", tags=["internal"])
app.include_router(system_control.router, prefix="/api/internal/system", tags=["internal"])

# WebSocket routes
app.include_router(ws_pc.router)
app.include_router(ws_admin.router)

if _make_prometheus_app is not None:
    prometheus_app = _make_prometheus_app()
    app.mount("/metrics", prometheus_app)

# OTP routes
app.include_router(otp_router, prefix="/api", tags=["otp"])


class SendOtpRequest(BaseModel):
    email: EmailStr


@app.post("/api/send-otp/")
async def send_otp(payload: SendOtpRequest, background_tasks: BackgroundTasks):
    return await send_otp_email(payload.email, background_tasks)


@app.get("/")
def root():
    return {"message": "Lance Backend Running", "version": "1.0.0"}


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "ok",
        "service": "lance-backend",
        "timestamp": datetime.now(UTC).isoformat(),
    }


@app.get("/api/health")
def api_health_check():
    """
    Backwards-compatible health check endpoint for Docker / infrastructure
    that still probes /api/health instead of /health.
    """
    return health_check()


# Background task: moved to lifespan handler above for FastAPI 0.115+ compatibility.
