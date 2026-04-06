from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
