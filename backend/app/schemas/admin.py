from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None = None
    action: str
    detail: str | None = None
    timestamp: datetime
    ip: str | None = None
    model_config = ConfigDict(from_attributes=True)


class BackupEntryOut(BaseModel):
    id: int
    backup_type: str
    file_path: str
    created_at: datetime
    note: str | None = None
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


class LicenseBase(BaseModel):
    key: str
    cafe_id: int
    expires_at: datetime | None
    max_pcs: int


class LicenseCreate(LicenseBase):
    pass


class LicenseOut(LicenseBase):
    pass


class WebhookIn(BaseModel):
    url: str
    event: str
    secret: str | None = None


class WebhookOut(WebhookIn):
    id: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


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
