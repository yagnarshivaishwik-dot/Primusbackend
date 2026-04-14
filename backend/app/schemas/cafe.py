from pydantic import BaseModel, ConfigDict


class CafeBase(BaseModel):
    name: str
    location: str | None = None
    phone: str | None = None


class CafeCreate(CafeBase):
    owner_id: int


class CafeOnboard(BaseModel):
    full_name: str
    email: str
    preferred_username: str
    cafe_name: str
    cafe_location: str
    pc_count: int
    mobile_number: str
    timezone: str | None = "UTC"
    country: str | None = None
    city: str | None = None
    accept_terms: bool


class CafeOut(CafeBase):
    id: int
    owner_id: int
    model_config = ConfigDict(from_attributes=True)
