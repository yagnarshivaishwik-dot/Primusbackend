"""
Global database models.

These models live in the global database (primus_global) and store
platform-level data: user identity, cafe registry, subscriptions,
invoices, financial audit, licenses, and auth tokens.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.db.global_db import GlobalBase


# ---- User Identity (Global) ----

class UserGlobal(GlobalBase):
    """
    Global user identity. Authentication and personal data.
    Cafe-specific data (wallet, role per cafe) lives in cafe databases.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="client")
    password_hash = Column(String)
    phone = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    birthdate = Column(DateTime, nullable=True)
    tos_accepted = Column(Boolean, default=False)
    tos_accepted_at = Column(DateTime, nullable=True)
    two_factor_secret = Column(String, nullable=True)
    two_factor_recovery_codes = Column(JSON, nullable=True)  # hashed one-time recovery codes
    is_email_verified = Column(Boolean, default=False)
    email_verification_sent_at = Column(DateTime, nullable=True)
    # Legacy field - kept for backward compat during migration
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=True)
    # Legacy wallet - kept for backward compat, real wallet in cafe DB
    wallet_balance = Column(Numeric(12, 2), default=0)
    coins_balance = Column(Integer, default=0)
    user_group_id = Column(Integer, nullable=True)


# ---- Cafe Registry ----

class Cafe(GlobalBase):
    """Tenant registry. Each cafe gets its own database."""
    __tablename__ = "cafes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    location = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Provisioning status for per-cafe database
    db_provisioned = Column(Boolean, default=False)
    db_provisioned_at = Column(DateTime, nullable=True)


# ---- Multi-Tenant Security ----

class UserCafeMap(GlobalBase):
    """Maps users to cafes with per-cafe roles."""
    __tablename__ = "user_cafe_map"
    __table_args__ = (
        UniqueConstraint("user_id", "cafe_id", name="uq_user_cafe"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=False, index=True)
    role = Column(String, nullable=False)
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RefreshToken(GlobalBase):
    """Refresh tokens for JWT rotation."""
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    device_id = Column(String, nullable=True)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    revoked_at = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)


class PasswordResetToken(GlobalBase):
    """Password reset tokens."""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---- Subscription & Invoicing (Cafe -> Primus billing) ----

class Subscription(GlobalBase):
    """Cafe subscription to Primus platform."""
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=False, index=True)
    plan = Column(String, nullable=False)  # trial, starter, pro, enterprise
    status = Column(String, nullable=False, default="active")  # active, past_due, cancelled, expired
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="INR")
    billing_cycle = Column(String, default="monthly")  # monthly, yearly
    current_period_start = Column(DateTime, nullable=False)
    current_period_end = Column(DateTime, nullable=False)
    trial_ends_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    invoices = relationship("Invoice", back_populates="subscription")


class Invoice(GlobalBase):
    """Invoice for cafe subscription billing."""
    __tablename__ = "invoices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id = Column(UUID(as_uuid=True), ForeignKey("subscriptions.id"), nullable=True)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="INR")
    status = Column(String, nullable=False, default="draft")  # draft, issued, paid, overdue, void
    due_date = Column(DateTime, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    payment_method = Column(String, nullable=True)
    payment_reference = Column(String, nullable=True)
    line_items = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    subscription = relationship("Subscription", back_populates="invoices")


# ---- Financial Audit Mirror (APPEND-ONLY) ----

class PlatformFinancialAudit(GlobalBase):
    """
    Append-only audit mirror of all cafe financial transactions.

    CRITICAL: This table must NEVER be updated or deleted.
    DB-level REVOKE on UPDATE/DELETE enforced via migration.
    """
    __tablename__ = "platform_financial_audit"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cafe_id = Column(Integer, nullable=False, index=True)
    txn_type = Column(String, nullable=False, index=True)
    # wallet_topup, wallet_deduct, wallet_refund, order, session_billing,
    # subscription_payment, upi_payment
    txn_ref = Column(String, nullable=True)  # original transaction ID
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String, default="INR")
    user_id = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ---- Licensing ----

class License(GlobalBase):
    """Cafe license management."""
    __tablename__ = "licenses"

    key = Column(String, primary_key=True, unique=True, index=True)
    cafe_id = Column(Integer, ForeignKey("cafes.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    activated_at = Column(DateTime, nullable=True)
    max_pcs = Column(Integer, nullable=False)


class LicenseKey(GlobalBase):
    """License key registry."""
    __tablename__ = "license_keys"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True, nullable=False)
    assigned_to = Column(String, nullable=True)
    issued_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    activated_at = Column(DateTime, nullable=True)
    last_activated_ip = Column(String, nullable=True)


class ClientUpdate(GlobalBase):
    """Client software version management."""
    __tablename__ = "client_updates"

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    file_url = Column(String, nullable=False)
    release_date = Column(DateTime, default=datetime.utcnow)
    force_update = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
