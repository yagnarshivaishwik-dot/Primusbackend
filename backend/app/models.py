from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class SystemEvent(Base):
    __tablename__ = "system_events"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, index=True)  # e.g., "pc.status", "command.ack", "session.start"
    cafe_id = Column(Integer, ForeignKey("cafes.id"), index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    payload = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)


class PC(Base):
    __tablename__ = "pcs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    status = Column(String, default="idle")  # idle, in_use, locked, offline, shutting_down, restarting
    last_seen = Column(DateTime, default=datetime.utcnow)
    current_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    banned = Column(Boolean, default=False)
    ban_reason = Column(String, nullable=True)
    current_user = relationship("User")
    admin_rights = Column(Boolean, default=False)


class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"))
    client_pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    paid = Column(Boolean, default=False)
    paid = Column(Boolean, default=False)
    amount = Column(Float, default=0.0)


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow)
    type = Column(String)  # 'topup', 'deduct', 'refund'
    description = Column(String, nullable=True)


class Game(Base):
    __tablename__ = "games"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    exe_path = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    icon_url = Column(String, nullable=True)
    version = Column(String, nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
    is_free = Column(Boolean, default=False)
    min_age = Column(Integer, nullable=True)
    enabled = Column(Boolean, default=False)
    category = Column(String, default="game")  # game, app
    description = Column(String, nullable=True)
    age_rating = Column(Integer, default=0)
    tags = Column(String, nullable=True)  # JSON string of tags
    website = Column(String, nullable=True)
    pc_groups = Column(String, nullable=True)  # JSON string of eligible PC groups
    user_groups = Column(String, nullable=True)  # JSON string of eligible user groups
    launchers = Column(String, nullable=True)  # JSON string of launcher configs
    never_use_parent_license = Column(Boolean, default=False)
    image_600x900 = Column(String, nullable=True)  # URL to poster image
    image_background = Column(String, nullable=True)  # URL to background image


class PCGame(Base):
    __tablename__ = "pc_games"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"))
    game_id = Column(Integer, ForeignKey("games.id"))


class RemoteCommand(Base):
    __tablename__ = "remote_commands"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"))
    command = Column(String)  # e.g. shutdown, restart, lock, unlock, message
    params = Column(String, nullable=True)  # for extra info (JSON as string, e.g. a message)
    state = Column(String, default="PENDING")  # PENDING, DELIVERED, RUNNING, SUCCEEDED, FAILED
    result = Column(JSON, nullable=True)
    idempotency_key = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    executed = Column(Boolean, default=False)
    acknowledged_at = Column(DateTime, nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"))
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = broadcast/all
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)  # if message targets a PC
    message = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    read = Column(Boolean, default=False)


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = broadcast
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)
    type = Column(String)  # info, warning, error, alert, etc.
    content = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    seen = Column(Boolean, default=False)


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    pc_id = Column(Integer, ForeignKey("pcs.id"), nullable=True)
    issue = Column(String)
    status = Column(String, default="open")  # open, in_progress, closed
    assigned_staff = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(String)
    type = Column(String, default="info")  # info, warning, success, error
    created_at = Column(DateTime, default=datetime.utcnow)
    start_time = Column(DateTime, nullable=True)  # for scheduled
    end_time = Column(DateTime, nullable=True)  # for expiry/hide
    active = Column(Boolean, default=True)
    target_role = Column(String, nullable=True)  # user, staff, admin, or None for all


class HardwareStat(Base):
    __tablename__ = "hardware_stats"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    cpu_percent = Column(Float)
    ram_percent = Column(Float)
    disk_percent = Column(Float)
    gpu_percent = Column(Float, nullable=True)  # Optional, if you can fetch GPU
    temp = Column(Float, nullable=True)


class ClientUpdate(Base):
    __tablename__ = "client_updates"
    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, unique=True)
    description = Column(String, nullable=True)
    file_url = Column(String)  # Link to the update installer/exe/zip
    release_date = Column(DateTime, default=datetime.utcnow)
    force_update = Column(Boolean, default=False)
    active = Column(Boolean, default=True)


class LicenseKey(Base):
    __tablename__ = "license_keys"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    assigned_to = Column(String, nullable=True)  # cafe name, PC, or user email
    issued_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    activated_at = Column(DateTime, nullable=True)
    last_activated_ip = Column(String, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String)
    detail = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    ip = Column(String, nullable=True)


class PCGroup(Base):
    __tablename__ = "pc_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    description = Column(String, nullable=True)


class PCToGroup(Base):
    __tablename__ = "pc_to_group"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("pcs.id"))
    group_id = Column(Integer, ForeignKey("pc_groups.id"))


class BackupEntry(Base):
    __tablename__ = "backup_entries"
    id = Column(Integer, primary_key=True, index=True)
    backup_type = Column(String, default="manual")  # manual, scheduled, auto
    file_path = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    note = Column(String, nullable=True)


class PricingRule(Base):
    __tablename__ = "pricing_rules"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    rate_per_hour = Column(Float)
    group_id = Column(Integer, ForeignKey("pc_groups.id"), nullable=True)  # null=default/global
    start_time = Column(DateTime, nullable=True)  # for timed promos
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    description = Column(String, nullable=True)


class Offer(Base):
    __tablename__ = "offers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    description = Column(String, nullable=True)
    price = Column(Float)
    hours_minutes = Column(Integer)  # Duration in minutes (more precise than float hours)
    active = Column(Boolean, default=True)


class UserOffer(Base):
    __tablename__ = "user_offers"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    offer_id = Column(Integer, ForeignKey("offers.id"), nullable=True)
    purchased_at = Column(DateTime, default=datetime.utcnow)
    minutes_remaining = Column(Integer)  # Remaining time in minutes


class CoinTransaction(Base):
    __tablename__ = "coin_transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Integer)
    timestamp = Column(DateTime, default=datetime.utcnow)
    reason = Column(String, nullable=True)


class Webhook(Base):
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True, index=True)
    url = Column(String)
    event = Column(String)  # e.g., "user_registered", "payment_received"
    is_active = Column(Boolean, default=True)
    secret = Column(String, nullable=True)  # Optional: for verifying authenticity
    created_at = Column(DateTime, default=datetime.utcnow)


class PlatformAccount(Base):
    __tablename__ = "platform_accounts"
    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"))
    platform = Column(String)  # steam, epic, etc.
    username = Column(String)
    secret = Column(String)  # store encrypted/placeholder
    in_use = Column(Boolean, default=False)
    assigned_pc_id = Column(Integer, ForeignKey("client_pcs.id"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    last_used = Column(DateTime, nullable=True)


class LicenseAssignment(Base):
    __tablename__ = "license_assignments"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("platform_accounts.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    pc_id = Column(Integer, ForeignKey("client_pcs.id"))
    game_id = Column(Integer, ForeignKey("games.id"))
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)


class MembershipPackage(Base):
    __tablename__ = "membership_packages"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    description = Column(String, nullable=True)
    price = Column(Float)
    minutes_included = Column(Integer, nullable=True)  # Minutes included, None for unlimited
    valid_days = Column(Integer, nullable=True)  # e.g., 30 for monthly
    active = Column(Boolean, default=True)


class UserGroup(Base):
    __tablename__ = "user_groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    discount_percent = Column(Float, default=0.0)
    coin_multiplier = Column(Float, default=1.0)
    postpay_allowed = Column(Boolean, default=False)


class UserMembership(Base):
    __tablename__ = "user_memberships"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    package_id = Column(Integer, ForeignKey("membership_packages.id"))
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    minutes_remaining = Column(Integer, nullable=True)  # Remaining minutes


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    pc_id = Column(Integer, ForeignKey("pcs.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String, default="pending")  # pending, confirmed, cancelled, completed
    created_at = Column(DateTime, default=datetime.utcnow)


class Screenshot(Base):
    __tablename__ = "screenshots"
    id = Column(Integer, primary_key=True, index=True)
    pc_id = Column(Integer, ForeignKey("client_pcs.id"))
    image_url = Column(String)  # Path or link to saved screenshot
    timestamp = Column(DateTime, default=datetime.utcnow)
    taken_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class ProductCategory(Base):
    __tablename__ = "product_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    price = Column(Float)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    active = Column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    total = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer, default=1)
    price = Column(Float)


# Advanced engagement: prizes, leaderboards, events, coupons


class Prize(Base):
    __tablename__ = "prizes"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String, nullable=True)
    coin_cost = Column(Integer)
    stock = Column(Integer, default=0)
    active = Column(Boolean, default=True)


class PrizeRedemption(Base):
    __tablename__ = "prize_redemptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    prize_id = Column(Integer, ForeignKey("prizes.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="pending")


class Leaderboard(Base):
    __tablename__ = "leaderboards"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    scope = Column(String, default="daily")  # daily, weekly, monthly
    metric = Column(String, default="play_minutes")
    active = Column(Boolean, default=True)


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"
    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    value = Column(Integer, default=0)


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    type = Column(String)  # challenge, quest
    rule_json = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    active = Column(Boolean, default=True)


class EventProgress(Base):
    __tablename__ = "event_progress"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    progress = Column(Integer, default=0)
    completed = Column(Boolean, default=False)


class Coupon(Base):
    __tablename__ = "coupons"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True)
    discount_percent = Column(Float, default=0.0)
    max_uses = Column(Integer, nullable=True)
    per_user_limit = Column(Integer, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    applies_to = Column(String, default="*")
    times_used = Column(Integer, default=0)


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"
    id = Column(Integer, primary_key=True, index=True)
    coupon_id = Column(Integer, ForeignKey("coupons.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)


class Cafe(Base):
    __tablename__ = "cafes"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    location = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    users = relationship("User", back_populates="cafe", foreign_keys="[User.cafe_id]")
    licenses = relationship("License", back_populates="cafe")
    pcs = relationship("ClientPC", back_populates="cafe")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    role = Column(String, default="staff")
    password_hash = Column(String)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=True)
    cafe = relationship("Cafe", back_populates="users", foreign_keys="[User.cafe_id]")
    # Wallet balance in paise (1/100 of currency unit). CHECK constraint: >= 0
    wallet_balance = Column(Float, default=0.0)
    # Coin balance for loyalty system
    coins_balance = Column(Integer, default=0)
    birthdate = Column(DateTime, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    tos_accepted = Column(Boolean, default=False)
    tos_accepted_at = Column(DateTime, nullable=True)
    user_group_id = Column(Integer, ForeignKey("user_groups.id"), nullable=True)
    two_factor_secret = Column(String, nullable=True)
    # Email verification
    is_email_verified = Column(Boolean, default=False)
    email_verification_sent_at = Column(DateTime, nullable=True)
    # pcs = relationship("ClientPC", back_populates="cafe")


class License(Base):
    __tablename__ = "licenses"
    key = Column(String, primary_key=True, unique=True, index=True)
    cafe_id = Column(Integer, ForeignKey("cafes.id"))
    expires_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    activated_at = Column(DateTime, nullable=True)  # Added for trial activation
    max_pcs = Column(Integer)
    cafe = relationship("Cafe", back_populates="licenses")


class ClientPC(Base):
    __tablename__ = "client_pcs"
    id = Column(Integer, primary_key=True, index=True)
    license_key = Column(String, ForeignKey("licenses.key"))
    name = Column(String)
    status = Column(String, default="offline")  # online, offline, in_use, locked, shutting_down, restarting
    last_seen = Column(DateTime)
    ip_address = Column(String)
    cafe_id = Column(Integer, ForeignKey("cafes.id"))
    cafe = relationship("Cafe", back_populates="pcs")
    current_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    device_id = Column(String, nullable=True)
    device_secret = Column(String, nullable=True)  # HMAC key for signed requests
    hardware_fingerprint = Column(String, unique=True, index=True)
    capabilities = Column(JSON, nullable=True)
    bound = Column(Boolean, default=False)
    bound_at = Column(DateTime, nullable=True)
    grace_until = Column(DateTime, nullable=True)
    suspended = Column(Boolean, default=False)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token = Column(String, unique=True, index=True)
    expires_at = Column(DateTime)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, index=True)  # e.g., 'financial', 'reports', 'center_info', etc.
    key = Column(String, index=True)
    value = Column(String)  # JSON string for complex values
    value_type = Column(String, default="string")  # string, number, boolean, json
    description = Column(String, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    is_public = Column(Boolean, default=False)  # if true, can be read by clients
