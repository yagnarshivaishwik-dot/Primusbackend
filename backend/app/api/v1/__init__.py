"""
API v1 — Versioned router aggregator.

All public API endpoints are mounted under /api/v1/... for forward-compatible
versioning. The legacy /api/... routes remain as deprecated aliases for
backward compatibility during the migration period.
"""

from fastapi import APIRouter

from app.api.endpoints import (
    admin_events,
    admin_sessions,
    analytics,
    announcement,
    audit,
    auth,
    backup,
    billing,
    booking,
    cafe,
    campaign,
    chat,
    client_pc,
    coupon,
    device_admin,
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
    reports,
    screenshot,
    security_utils,
    session,
    settings,
    shop,
    social_auth,
    staff,
    stats,
    subscription,
    support_ticket,
    update,
    upi,
    user,
    user_group,
    wallet,
    webhook,
)

v1_router = APIRouter(prefix="/api/v1")

# Auth & Users
v1_router.include_router(auth.router, prefix="/auth", tags=["v1-auth"])
v1_router.include_router(user.router, prefix="/user", tags=["v1-user"])
v1_router.include_router(social_auth.router, prefix="/social", tags=["v1-social"])
v1_router.include_router(staff.router, prefix="/staff", tags=["v1-staff"])
v1_router.include_router(membership.router, prefix="/membership", tags=["v1-membership"])
v1_router.include_router(user_group.router, prefix="/usergroup", tags=["v1-usergroup"])

# PC & Hardware
v1_router.include_router(pc.router, prefix="/pc", tags=["v1-pc"])
v1_router.include_router(client_pc.router, prefix="/clientpc", tags=["v1-clientpc"])
v1_router.include_router(pc_admin.router, prefix="/pcadmin", tags=["v1-pcadmin"])
v1_router.include_router(pc_ban.router, prefix="/pcban", tags=["v1-pcban"])
v1_router.include_router(pc_group.router, prefix="/pcgroup", tags=["v1-pcgroup"])
v1_router.include_router(hardware.router, prefix="/hardware", tags=["v1-hardware"])
v1_router.include_router(device_admin.router, prefix="/device", tags=["v1-device"])

# Sessions & Gaming
v1_router.include_router(session.router, prefix="/session", tags=["v1-session"])
v1_router.include_router(game.router, prefix="/game", tags=["v1-game"])
v1_router.include_router(games.router, prefix="/games", tags=["v1-games"])
v1_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["v1-leaderboard"])
v1_router.include_router(event.router, prefix="/event", tags=["v1-event"])
v1_router.include_router(stats.router, prefix="/stats", tags=["v1-stats"])
v1_router.include_router(analytics.router, prefix="/analytics", tags=["v1-analytics"])

# Wallet & Payments
v1_router.include_router(wallet.router, prefix="/wallet", tags=["v1-wallet"])
v1_router.include_router(payment.router, prefix="/payment", tags=["v1-payment"])
v1_router.include_router(billing.router, prefix="/billing", tags=["v1-billing"])

# Commerce & Offers
v1_router.include_router(shop.router, prefix="/shop", tags=["v1-shop"])
v1_router.include_router(offer.router, prefix="/offer", tags=["v1-offer"])
v1_router.include_router(coupon.router, prefix="/coupon", tags=["v1-coupon"])
v1_router.include_router(prize.router, prefix="/prize", tags=["v1-prize"])
v1_router.include_router(booking.router, prefix="/booking", tags=["v1-booking"])
v1_router.include_router(campaign.router, prefix="/campaign", tags=["v1-campaign"])

# Communication
v1_router.include_router(chat.router, prefix="/chat", tags=["v1-chat"])
v1_router.include_router(notification.router, prefix="/notification", tags=["v1-notification"])
v1_router.include_router(support_ticket.router, prefix="/support", tags=["v1-support"])
v1_router.include_router(announcement.router, prefix="/announcement", tags=["v1-announcement"])

# Admin & Operations
v1_router.include_router(remote_command.router, prefix="/command", tags=["v1-command"])
v1_router.include_router(audit.router, prefix="/audit", tags=["v1-audit"])
v1_router.include_router(backup.router, prefix="/backup", tags=["v1-backup"])
v1_router.include_router(license.router, prefix="/license", tags=["v1-license"])
v1_router.include_router(update.router, prefix="/update", tags=["v1-update"])
v1_router.include_router(screenshot.router, prefix="/screenshot", tags=["v1-screenshot"])
v1_router.include_router(settings.router, prefix="/settings", tags=["v1-settings"])
v1_router.include_router(cafe.router, prefix="/cafe", tags=["v1-cafe"])
v1_router.include_router(webhook.router, prefix="/webhook", tags=["v1-webhook"])
v1_router.include_router(security_utils.router, prefix="/security", tags=["v1-security"])
v1_router.include_router(admin_events.router, prefix="/admin/events", tags=["v1-events"])
v1_router.include_router(admin_sessions.router, prefix="/admin/sessions", tags=["v1-admin-sessions"])
