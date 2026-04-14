from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PCRegister(BaseModel):
    name: str


class PCOut(BaseModel):
    id: int
    name: str
    status: str
    last_seen: datetime
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


class PCGameOut(BaseModel):
    id: int
    pc_id: int
    game_id: int
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


class ClientPCBase(BaseModel):
    name: str
    ip_address: str | None = None


class ClientPCCreate(BaseModel):
    name: str
    license_key: str
    hardware_fingerprint: str
    capabilities: dict | None = None


class ClientPCOut(ClientPCBase):
    id: int
    status: str
    last_seen: datetime | None = None
    cafe_id: int
    license_key: str
    device_id: str | None = None
    device_secret: str | None = None
    bound: bool | None = None
    bound_at: datetime | None = None
    grace_until: datetime | None = None
    suspended: bool | None = None
    model_config = ConfigDict(from_attributes=True)


class RemoteCommandIn(BaseModel):
    pc_id: int
    command: str
    params: str | None = None


class RemoteCommandOut(RemoteCommandIn):
    id: int
    state: str
    result: dict | None = None
    issued_at: datetime
    expires_at: datetime | None = None
    executed: bool
    acknowledged_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class ScreenshotOut(BaseModel):
    id: int
    pc_id: int
    image_url: str
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)
