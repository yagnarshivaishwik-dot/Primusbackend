from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserBase(BaseModel):
    name: str
    email: str


class UserCreate(UserBase):
    password: str
    role: str = "client"
    cafe_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    tos_accepted: bool | None = None


class UserOut(UserBase):
    id: int
    role: str
    cafe_id: int | None
    birthdate: datetime | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    tos_accepted: bool | None = None
    is_email_verified: bool | None = None
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    birthdate: datetime | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None


## Firebase-only: remove legacy OTP schemas


class CafeBase(BaseModel):
    name: str


class CafeCreate(CafeBase):
    owner_id: int


class CafeOut(CafeBase):
    id: int
    owner_id: int
    model_config = ConfigDict(from_attributes=True)


class PCRegister(BaseModel):
    name: str


class PCOut(BaseModel):
    id: int
    name: str
    status: str
    last_seen: datetime
    model_config = ConfigDict(from_attributes=True)


class SessionStart(BaseModel):
    pc_id: int
    user_id: int


class SessionOut(BaseModel):
    id: int
    pc_id: int
    user_id: int
    start_time: datetime
    end_time: datetime | None
    paid: bool
    amount: float
    model_config = ConfigDict(from_attributes=True)


class WalletTransactionOut(BaseModel):
    id: int
    user_id: int
    amount: float
    timestamp: datetime
    type: str
    description: str | None
    model_config = ConfigDict(from_attributes=True)


class WalletAction(BaseModel):
    amount: float
    type: str
    description: str | None = None


class GameBase(BaseModel):
    name: str
    exe_path: str
    icon_url: str | None = None
    version: str | None = None
    is_free: bool | None = False
    min_age: int | None = None


class GameOut(GameBase):
    id: int
    last_updated: datetime
    model_config = ConfigDict(from_attributes=True)


class PlatformAccountIn(BaseModel):
    game_id: int
    platform: str
    username: str
    secret: str


class PlatformAccountOut(BaseModel):
    id: int
    game_id: int
    platform: str
    username: str
    in_use: bool
    assigned_pc_id: int | None = None
    assigned_user_id: int | None = None
    model_config = ConfigDict(from_attributes=True)


class LicenseAssignIn(BaseModel):
    game_id: int
    pc_id: int


class LicenseAssignOut(BaseModel):
    id: int
    account_id: int
    user_id: int
    pc_id: int
    game_id: int
    started_at: datetime
    ended_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class PCGameOut(BaseModel):
    id: int
    pc_id: int
    game_id: int
    model_config = ConfigDict(from_attributes=True)


class RemoteCommandIn(BaseModel):
    pc_id: int
    command: str
    params: str | None = None


class RemoteCommandOut(RemoteCommandIn):
    id: int
    issued_at: datetime
    executed: bool
    model_config = ConfigDict(from_attributes=True)


class ChatMessageIn(BaseModel):
    to_user_id: int | None = None
    pc_id: int | None = None
    message: str


class ChatMessageOut(ChatMessageIn):
    id: int
    from_user_id: int
    timestamp: datetime
    read: bool
    model_config = ConfigDict(from_attributes=True)


class NotificationIn(BaseModel):
    user_id: int | None = None
    pc_id: int | None = None
    type: str = "info"
    content: str


class NotificationOut(NotificationIn):
    id: int
    created_at: datetime
    seen: bool
    model_config = ConfigDict(from_attributes=True)


class SupportTicketIn(BaseModel):
    pc_id: int | None = None
    issue: str


class SupportTicketOut(SupportTicketIn):
    id: int
    user_id: int
    status: str
    assigned_staff: int | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AnnouncementIn(BaseModel):
    content: str
    type: str = "info"
    start_time: datetime | None = None
    end_time: datetime | None = None
    target_role: str | None = None


class AnnouncementOut(AnnouncementIn):
    id: int
    created_at: datetime
    active: bool
    model_config = ConfigDict(from_attributes=True)


class HardwareStatIn(BaseModel):
    pc_id: int
    cpu_percent: float
    ram_percent: float
    disk_percent: float
    gpu_percent: float | None = None
    temp: float | None = None


class HardwareStatOut(HardwareStatIn):
    id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class ClientUpdateIn(BaseModel):
    version: str
    description: str | None = None
    file_url: str
    force_update: bool = False


class ClientUpdateOut(ClientUpdateIn):
    id: int
    release_date: datetime
    active: bool
    model_config = ConfigDict(from_attributes=True)


class LicenseKeyIn(BaseModel):
    key: str
    assigned_to: str | None = None
    expires_at: datetime | None = None


class LicenseKeyOut(LicenseKeyIn):
    id: int
    issued_at: datetime
    is_active: bool
    activated_at: datetime | None = None
    last_activated_ip: str | None = None
    model_config = ConfigDict(from_attributes=True)


class LicenseActivateIn(BaseModel):
    key: str
    assigned_to: str


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None = None
    action: str
    detail: str | None = None
    timestamp: datetime
    ip: str | None = None
    model_config = ConfigDict(from_attributes=True)


class PCGroupIn(BaseModel):
    name: str
    description: str | None = None


class PCGroupOut(PCGroupIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class PCToGroupIn(BaseModel):
    pc_id: int
    group_id: int


class PCToGroupOut(PCToGroupIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BackupEntryOut(BaseModel):
    id: int
    backup_type: str
    file_path: str
    created_at: datetime
    note: str | None = None
    model_config = ConfigDict(from_attributes=True)


class PricingRuleIn(BaseModel):
    name: str
    rate_per_hour: float
    group_id: int | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    description: str | None = None


class PricingRuleOut(PricingRuleIn):
    id: int
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class WebhookIn(BaseModel):
    url: str
    event: str
    secret: str | None = None


class WebhookOut(WebhookIn):
    id: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MembershipPackageIn(BaseModel):
    name: str
    description: str | None = None
    price: float
    hours_included: float | None = None
    valid_days: int | None = None


class MembershipPackageOut(MembershipPackageIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class UserMembershipOut(BaseModel):
    id: int
    user_id: int
    package_id: int
    start_date: datetime
    end_date: datetime | None = None
    hours_remaining: float | None = None
    model_config = ConfigDict(from_attributes=True)


class BookingIn(BaseModel):
    pc_id: int
    start_time: datetime
    end_time: datetime


class BookingOut(BookingIn):
    id: int
    user_id: int
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LicenseBase(BaseModel):
    key: str
    cafe_id: int
    expires_at: datetime | None
    max_pcs: int


class LicenseCreate(LicenseBase):
    pass


class LicenseOut(LicenseBase):
    pass


class ClientPCBase(BaseModel):
    name: str
    ip_address: str | None


class ClientPCCreate(ClientPCBase):
    license_key: str


class ClientPCOut(ClientPCBase):
    id: int
    status: str
    last_seen: datetime | None
    cafe_id: int
    license_key: str
    device_id: str | None = None
    bound: bool | None = None
    bound_at: datetime | None = None
    grace_until: datetime | None = None
    suspended: bool | None = None
    model_config = ConfigDict(from_attributes=True)


# Prizes
class PrizeIn(BaseModel):
    name: str
    description: str | None = None
    coin_cost: int
    stock: int


class PrizeOut(PrizeIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class PrizeRedemptionOut(BaseModel):
    id: int
    user_id: int
    prize_id: int
    timestamp: datetime
    status: str
    model_config = ConfigDict(from_attributes=True)


# Coupons
class CouponIn(BaseModel):
    code: str
    discount_percent: float = 0.0
    max_uses: int | None = None
    per_user_limit: int | None = None
    expires_at: datetime | None = None
    applies_to: str = "*"


class CouponOut(CouponIn):
    id: int
    times_used: int
    model_config = ConfigDict(from_attributes=True)


class CouponRedeemIn(BaseModel):
    code: str
    target: str
    offer_id: int | None = None
    product_id: int | None = None


class CouponRedemptionOut(BaseModel):
    id: int
    coupon_id: int
    user_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


# Leaderboards
class LeaderboardIn(BaseModel):
    name: str
    scope: str = "daily"
    metric: str = "play_minutes"


class LeaderboardOut(LeaderboardIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class LeaderboardEntryOut(BaseModel):
    id: int
    leaderboard_id: int
    user_id: int
    period_start: datetime
    period_end: datetime
    value: int
    model_config = ConfigDict(from_attributes=True)


# Events
class EventIn(BaseModel):
    name: str
    type: str
    rule_json: str
    start_time: datetime
    end_time: datetime


class EventOut(EventIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class EventProgressOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    progress: int
    completed: bool
    model_config = ConfigDict(from_attributes=True)


# Offers and Coins
class OfferIn(BaseModel):
    name: str
    description: str | None = None
    price: float
    hours: float


class OfferOut(OfferIn):
    id: int
    active: bool
    model_config = ConfigDict(from_attributes=True)


class UserOfferOut(BaseModel):
    id: int
    user_id: int
    offer_id: int
    purchased_at: datetime
    hours_remaining: float
    model_config = ConfigDict(from_attributes=True)


class CoinTransactionOut(BaseModel):
    id: int
    user_id: int
    amount: int
    timestamp: datetime
    reason: str | None = None
    model_config = ConfigDict(from_attributes=True)


class UserGroupIn(BaseModel):
    name: str
    discount_percent: float = 0.0
    coin_multiplier: float = 1.0
    postpay_allowed: bool = False


class UserGroupOut(UserGroupIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


# Settings
class SettingIn(BaseModel):
    category: str
    key: str
    value: str
    value_type: str = "string"
    description: str | None = None


class SettingUpdate(BaseModel):
    value: str
    value_type: str = "string"
    description: str | None = None


class SettingOut(SettingIn):
    id: int
    updated_by: int | None = None
    updated_at: datetime
    is_public: bool
    model_config = ConfigDict(from_attributes=True)


class SettingsBulkUpdate(BaseModel):
    settings: list[SettingIn]


# Games
class GameInfoBase(BaseModel):
    name: str
    logo_url: str | None = None
    enabled: bool = False
    category: str = "game"
    description: str | None = None
    exe_path: str | None = None
    icon_url: str | None = None
    version: str | None = None
    is_free: bool = False
    min_age: int | None = None
    age_rating: int = 0
    tags: str | None = None
    website: str | None = None
    pc_groups: str | None = None
    user_groups: str | None = None
    launchers: str | None = None
    never_use_parent_license: bool = False
    image_600x900: str | None = None
    image_background: str | None = None


class GameCreate(GameInfoBase):
    pass


class GameUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    enabled: bool | None = None
    category: str | None = None
    description: str | None = None
    exe_path: str | None = None
    icon_url: str | None = None
    version: str | None = None
    is_free: bool | None = None
    min_age: int | None = None


class Game(GameInfoBase):
    id: int
    last_updated: datetime
    model_config = ConfigDict(from_attributes=True)
