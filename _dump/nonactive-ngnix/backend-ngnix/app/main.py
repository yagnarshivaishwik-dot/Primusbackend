import asyncio
import logging
import os

# Import OTP functionality
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from app.api.endpoints import (
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
    session,
    settings,
    social_auth,
    staff,
    stats,
    support_ticket,
    update,
    user,
    user_group,
    wallet,
    webhook,
)
from app.database import Base, engine
from app.middleware.csrf import CSRFProtectionMiddleware
from app.middleware.security import (
    RateLimitMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.ws import admin as ws_admin
from app.ws import pc as ws_pc

sys.path.append("..")
from app.tasks.timeleft_broadcast import _broadcast_timeleft_loop
from otp_email import send_otp_email
from verify_otp import router as otp_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context.

    Starts background tasks (e.g., time-left broadcast loop) on startup
    and can be extended later for graceful shutdown if needed.
    """
    try:
        asyncio.create_task(_broadcast_timeleft_loop())
    except Exception as e:
        logging.error(f"Failed to start background task: {e}")
    yield
    # No specific shutdown logic needed currently


# Load environment from .env if present, overriding any pre-set DATABASE_URL
try:
    load_dotenv(override=True)
except Exception:
    pass

# Database initialization
# NOTE: For all environments, use Alembic migrations instead of create_all()
# Run: alembic upgrade head
is_production = os.getenv("ENVIRONMENT", "").lower() == "production"

if not is_production:
    logging.getLogger(__name__).warning(
        "Primus (ngnix app) is PostgreSQL-only. Ensure database migrations are applied using: "
        "alembic upgrade head"
    )
else:
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

# Rate limiting middleware
rate_limit_rpm = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
rate_limit_burst = int(os.getenv("RATE_LIMIT_BURST", "10"))
app.add_middleware(RateLimitMiddleware, requests_per_minute=rate_limit_rpm, burst=rate_limit_burst)

# Request size limit middleware
max_request_size = int(os.getenv("MAX_REQUEST_SIZE_BYTES", str(10 * 1024 * 1024)))  # 10MB default
app.add_middleware(RequestSizeLimitMiddleware, max_size_bytes=max_request_size)

# CORS configuration
origins = [
    "https://primustech.in",  # Production frontend
    "https://www.primustech.in",  # Production frontend (www)
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",  # Alternative dev port
]

# FOR DEVELOPMENT ONLY: allow all origins when ALLOW_ALL_CORS=true
# Never allow in production - this is a security risk
allow_all_cors = os.getenv("ALLOW_ALL_CORS", "false").lower() == "true"
environment = os.getenv("ENVIRONMENT", "").lower()

# Fail-fast if ALLOW_ALL_CORS is enabled in production
if allow_all_cors and environment == "production":
    raise ValueError("ALLOW_ALL_CORS cannot be true in production. This is a security risk.")

# Allow CORS wildcard only in development
if allow_all_cors and environment != "production":
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )


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

# WebSocket routes
app.include_router(ws_pc.router)
app.include_router(ws_admin.router)

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


# Background task: moved to lifespan handler above for FastAPI 0.115+ compatibility.
