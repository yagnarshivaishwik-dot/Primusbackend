"""
Cafe database models.

These models live in per-cafe databases (primus_cafe_{id}).
They store all cafe-scoped operational data: users, wallets,
sessions, orders, games, etc.

IMPORTANT: No cafe_id column on these models - the database
itself IS the cafe boundary. Foreign keys to cafes table are
removed since cafes live in the global DB.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.cafe_db import CafeBase


# ---- Cafe-Local User ----

class CafeUser(CafeBase):
    """
    Local user record in a cafe database.
    Links to global user via global_user_id.
    Stores cafe-specific data: wallet, role, coins.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    global_user_id = Column(Integer, nullable=False, unique=True, index=True)
    name = Column(String, nullable=True)  # denormalized from global
    email = Column(String, nullable=True, index=True)  # denormalized from global
    role = Column(String, default="client")  # cafe-specific role
    wallet_balance = Column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )
    coins_balance = Column(Integer, default=0)
    user_group_id = Column(Integer, ForeignKey("user_groups.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---- Wallet & Transactions ----

class WalletTransaction(CafeBase):
    """All wallet movements: topup, deduct, refund."""
    __tablename__ = "wallet_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    type = Column(String, nullable=False)  # topup, deduct, refund
    description = Column(String, nullable=True)
    idempotency_key = Column(String, nullable=True, unique=True, index=True)


class CoinTransaction(CafeBase):
    """Loyalty coin tracking."""
    __tablename__ = "coin_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    reason = Column(String, nullable=True)


# ---- Sessions & Billing ----

class Session(CafeBase):
    """PC usage session with billing."""
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    paid = Column(Boolean, default=False)
    amount = Column(Numeric(12, 2), default=0)


class PricingRule(CafeBase):
    """Hourly rate rules for PC groups."""
    __tablename__ = "pricing_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    rate_per_hour = Column(Numeric(12, 2), nullable=False)
    group_id = Column(Integer, ForeignKey("pc_groups.id"), nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    description = Column(String, nullable=True)


# ---- Offers & Memberships ----

class Offer(CafeBase):
    """Time packages purchasable by users."""
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Numeric(12, 2), nullable=False)
    hours_minutes = Column(Integer, nullable=False)  # duration in minutes
    active = Column(Boolean, default=True)


class UserOffer(CafeBase):
    """Purchased time packages with remaining balance."""
    __tablename__ = "user_offers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    offer_id = Column(Integer, ForeignKey("offers.id"), nullable=True)
    purchased_at = Column(DateTime, default=datetime.utcnow)
    minutes_remaining = Column(Integer, nullable=False)


class MembershipPackage(CafeBase):
    """Subscription tiers for cafe members."""
    __tablename__ = "membership_packages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    price = Column(Numeric(12, 2), nullable=False)
    minutes_included = Column(Integer, nullable=True)
    valid_days = Column(Integer, nullable=True)
    active = Column(Boolean, default=True)


class UserMembership(CafeBase):
    """Active user memberships."""
    __tablename__ = "user_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    package_id = Column(Integer, ForeignKey("membership_packages.id"), nullable=False)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    minutes_remaining = Column(Integer, nullable=True)


class UserGroup(CafeBase):
    """User segmentation with discounts and perks."""
    __tablename__ = "user_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    discount_percent = Column(Float, default=0.0)
    coin_multiplier = Column(Float, default=1.0)
    postpay_allowed = Column(Boolean, default=False)


# ---- Orders & Commerce ----

class Order(CafeBase):
    """Product orders from the cafe shop."""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    total = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    idempotency_key = Column(String, nullable=True, unique=True)


class OrderItem(CafeBase):
    """Line items in an order."""
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1)
    price = Column(Numeric(12, 2), nullable=False)


class Product(CafeBase):
    """Cafe shop products."""
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    active = Column(Boolean, default=True)


class ProductCategory(CafeBase):
    """Product categorization."""
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)


# ---- UPI & Payment Intents ----

class PaymentIntent(CafeBase):
    """Payment intent tracking for UPI and other async payments."""
    __tablename__ = "payment_intents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="INR")
    provider = Column(String, nullable=False)  # razorpay_upi, stripe, manual
    provider_ref = Column(String, nullable=True, unique=True)  # gateway order/intent ID
    status = Column(String, nullable=False, default="created")
    # created, pending, completed, failed, expired
    upi_vpa = Column(String, nullable=True)  # for UPI collect
    qr_data = Column(Text, nullable=True)  # QR code payload
    idempotency_key = Column(String, nullable=True, unique=True, index=True)
    webhook_payload = Column(JSONB, nullable=True)  # raw gateway response
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---- Daily Revenue Reports ----

class ReportDaily(CafeBase):
    """Daily aggregated revenue report."""
    __tablename__ = "reports_daily"
    __table_args__ = (
        UniqueConstraint("report_date", name="uq_report_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(DateTime, nullable=False, index=True)
    total_revenue = Column(Numeric(12, 2), default=0)
    total_sessions = Column(Integer, default=0)
    total_wallet_topups = Column(Numeric(12, 2), default=0)
    total_wallet_deductions = Column(Numeric(12, 2), default=0)
    total_orders = Column(Integer, default=0)
    total_order_revenue = Column(Numeric(12, 2), default=0)
    total_upi_payments = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---- PC & Hardware ----

class ClientPC(CafeBase):
    """Client machine registration."""
    __tablename__ = "client_pcs"

    id = Column(Integer, primary_key=True, index=True)
    license_key = Column(String, nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, default="offline")
    last_seen = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)
    current_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    device_id = Column(String, nullable=True)
    device_secret = Column(String, nullable=True)
    device_secret_hash = Column(String, nullable=True)
    hardware_fingerprint = Column(String, unique=True, index=True, nullable=True)
    capabilities = Column(JSON, nullable=True)
    bound = Column(Boolean, default=False)
    bound_at = Column(DateTime, nullable=True)
    grace_until = Column(DateTime, nullable=True)
    suspended = Column(Boolean, default=False)
    device_status = Column(String, default="active")
    allowed_ip_range = Column(String, nullable=True)


class PC(CafeBase):
    """Server-side PC representation."""
    __tablename__ = "pcs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="idle")
    last_seen = Column(DateTime, default=datetime.utcnow)
    current_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    banned = Column(Boolean, default=False)
    ban_reason = Column(String, nullable=True)
    admin_rights = Column(Boolean, default=False)


class PCGroup(CafeBase):
    """PC grouping for pricing and access control."""
    __tablename__ = "pc_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)


class PCToGroup(CafeBase):
    """PC to group membership."""
    __tablename__ = "pc_to_group"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=False)
    group_id = Column(Integer, ForeignKey("pc_groups.id"), nullable=False)


class HardwareStat(CafeBase):
    """PC performance metrics."""
    __tablename__ = "hardware_stats"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    cpu_percent = Column(Float, nullable=True)
    ram_percent = Column(Float, nullable=True)
    disk_percent = Column(Float, nullable=True)
    gpu_percent = Column(Float, nullable=True)
    temp = Column(Float, nullable=True)


class Screenshot(CafeBase):
    """PC screenshots for monitoring."""
    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=False)
    image_url = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    taken_by = Column(Integer, ForeignKey("users.id"), nullable=True)


# ---- Gaming & Engagement ----

class Game(CafeBase):
    """Game library."""
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    exe_path = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    icon_url = Column(String, nullable=True)
    version = Column(String, nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
    is_free = Column(Boolean, default=False)
    min_age = Column(Integer, nullable=True)
    enabled = Column(Boolean, default=False)
    category = Column(String, default="game")
    description = Column(String, nullable=True)
    age_rating = Column(Integer, default=0)
    tags = Column(String, nullable=True)
    website = Column(String, nullable=True)
    pc_groups = Column(String, nullable=True)
    user_groups = Column(String, nullable=True)
    launchers = Column(String, nullable=True)
    never_use_parent_license = Column(Boolean, default=False)
    image_600x900 = Column(String, nullable=True)
    image_background = Column(String, nullable=True)


class PCGame(CafeBase):
    """PC-to-game associations."""
    __tablename__ = "pc_games"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=False)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)


class PlatformAccount(CafeBase):
    """Shared game platform accounts."""
    __tablename__ = "platform_accounts"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    platform = Column(String, nullable=False)
    username = Column(String, nullable=False)
    secret = Column(String, nullable=False)
    in_use = Column(Boolean, default=False)
    assigned_pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_used = Column(DateTime, nullable=True)


class LicenseAssignment(CafeBase):
    """User-to-game-to-PC license bindings."""
    __tablename__ = "license_assignments"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("platform_accounts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=False)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


# ---- Prizes & Gamification ----

class Prize(CafeBase):
    """Redeemable prizes."""
    __tablename__ = "prizes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    coin_cost = Column(Integer, nullable=False)
    stock = Column(Integer, default=0)
    active = Column(Boolean, default=True)


class PrizeRedemption(CafeBase):
    """Prize redemption tracking."""
    __tablename__ = "prize_redemptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    prize_id = Column(Integer, ForeignKey("prizes.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="pending")


class Leaderboard(CafeBase):
    """Leaderboard configurations."""
    __tablename__ = "leaderboards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    scope = Column(String, default="daily")
    metric = Column(String, default="play_minutes")
    active = Column(Boolean, default=True)


class LeaderboardEntry(CafeBase):
    """Per-period per-user scores."""
    __tablename__ = "leaderboard_entries"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    value = Column(Integer, default=0)


class Event(CafeBase):
    """Challenges and quests."""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    rule_json = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    active = Column(Boolean, default=True)


class EventProgress(CafeBase):
    """User progress on events."""
    __tablename__ = "event_progress"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    progress = Column(Integer, default=0)
    completed = Column(Boolean, default=False)


class Coupon(CafeBase):
    """Discount codes."""
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, nullable=False)
    discount_percent = Column(Float, default=0.0)
    max_uses = Column(Integer, nullable=True)
    per_user_limit = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    applies_to = Column(String, default="*")
    times_used = Column(Integer, default=0)


class CouponRedemption(CafeBase):
    """Coupon usage tracking."""
    __tablename__ = "coupon_redemptions"

    id = Column(Integer, primary_key=True, index=True)
    coupon_id = Column(Integer, ForeignKey("coupons.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


# ---- Communication ----

class RemoteCommand(CafeBase):
    """Remote command execution."""
    __tablename__ = "remote_commands"

    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=False)
    command = Column(String, nullable=False)
    params = Column(String, nullable=True)
    state = Column(String, default="PENDING")
    result = Column(JSON, nullable=True)
    idempotency_key = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    executed = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime, nullable=True)


class ChatMessage(CafeBase):
    """In-app messaging."""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)
    message = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    read = Column(Boolean, default=False)


class Notification(CafeBase):
    """User notifications."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)
    type = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    seen = Column(Boolean, default=False)


class SupportTicket(CafeBase):
    """Support requests."""
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)
    issue = Column(String, nullable=False)
    status = Column(String, default="open")
    assigned_staff = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Announcement(CafeBase):
    """Cafe announcements."""
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=False)
    type = Column(String, default="info")
    created_at = Column(DateTime, default=datetime.utcnow)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True)
    target_role = Column(String, nullable=True)


# ---- Operations ----

class SystemEvent(CafeBase):
    """Structured event logging."""
    __tablename__ = "system_events"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    payload = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class AuditLog(CafeBase):
    """Action audit trail."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    detail = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    ip = Column(String, nullable=True)
    device_id = Column(String, nullable=True)


class DeviceIpHistory(CafeBase):
    """IP tracking per device for anomaly detection."""
    __tablename__ = "device_ip_history"

    id = Column(Integer, primary_key=True, index=True)
    client_pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=False, index=True)
    ip_address = Column(String, nullable=False)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    request_count = Column(Integer, default=1)


class Webhook(CafeBase):
    """Custom webhooks for events."""
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, nullable=False)
    event = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    secret = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Booking(CafeBase):
    """PC reservations."""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class BackupEntry(CafeBase):
    """Backup tracking."""
    __tablename__ = "backup_entries"

    id = Column(Integer, primary_key=True, index=True)
    backup_type = Column(String, default="manual")
    file_path = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    note = Column(String, nullable=True)


class Setting(CafeBase):
    """Key-value configuration store."""
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, index=True)
    key = Column(String, index=True)
    value = Column(String, nullable=True)
    value_type = Column(String, default="string")
    description = Column(String, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    is_public = Column(Boolean, default=False)
