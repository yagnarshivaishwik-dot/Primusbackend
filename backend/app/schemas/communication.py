from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
