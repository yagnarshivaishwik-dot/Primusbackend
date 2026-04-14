"""
Structured application settings using Pydantic BaseSettings.

This provides typed, validated configuration grouped by domain.
Falls back to the legacy app.config module-level variables for backward compat.

Usage:
    from app.core.settings import get_settings
    settings = get_settings()
    print(settings.security.jwt_secret)
"""

import functools
import os
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings


class SecuritySettings(BaseSettings):
    """Security-related configuration."""

    secret_key: str = ""
    jwt_secret: str = ""
    app_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 20
    refresh_token_expire_days: int = 7
    enable_totp_2fa: bool = False
    require_device_id_on_login: bool = False
    enforce_ip_whitelist: bool = False
    enable_csrf_protection: bool = True
    enable_rls: bool = False
    rate_limit_per_minute: int = 1000
    rate_limit_burst: int = 100
    max_request_size_bytes: int = 10 * 1024 * 1024

    model_config = {"env_prefix": "", "extra": "ignore"}


class DatabaseSettings(BaseSettings):
    """Database configuration."""

    database_url: str = ""
    global_database_url: str = ""
    multi_db_enabled: bool = False
    cafe_db_engine_cache_size: int = 50
    cafe_db_pool_size: int = 2
    cafe_db_max_overflow: int = 3
    use_pgbouncer: bool = False

    model_config = {"env_prefix": "", "extra": "ignore"}


class PaymentSettings(BaseSettings):
    """Payment gateway configuration."""

    stripe_secret: str = ""
    stripe_currency: str = "usd"
    stripe_success_url: str = "https://example.com/success"
    stripe_cancel_url: str = "https://example.com/cancel"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_currency: str = "INR"
    razorpay_success_url: str = "https://example.com/razorpay/success"
    upi_provider: str = "razorpay"
    upi_merchant_vpa: str = ""
    upi_webhook_secret: str = ""

    model_config = {"env_prefix": "", "extra": "ignore"}


class OAuthSettings(BaseSettings):
    """OAuth provider configuration."""

    google_client_id: str = ""
    google_client_secret: str = ""
    discord_client_id: str = ""
    discord_client_secret: str = ""
    twitter_client_id: str = ""
    twitter_client_secret: str = ""

    model_config = {"env_prefix": "", "extra": "ignore"}


class RedisSettings(BaseSettings):
    """Redis caching configuration."""

    redis_url: str = ""
    redis_password: str = ""
    redis_namespace: str = "clutchhh"
    cache_default_ttl: int = 300
    cache_version: str = "v1"

    model_config = {"env_prefix": "", "extra": "ignore"}


class AppSettings(BaseSettings):
    """Top-level application settings."""

    environment: str = "development"
    app_base_url: str = "http://localhost:8000"
    allow_all_cors: bool = False
    allowed_origins: str = ""

    model_config = {"env_prefix": "", "extra": "ignore"}

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def is_development(self) -> bool:
        return not self.is_production


class Settings:
    """Aggregated settings container."""

    def __init__(self):
        self.app = AppSettings()
        self.security = SecuritySettings()
        self.database = DatabaseSettings()
        self.payment = PaymentSettings()
        self.oauth = OAuthSettings()
        self.redis = RedisSettings()


@functools.lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance (singleton)."""
    return Settings()
