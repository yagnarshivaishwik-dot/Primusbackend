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
    profile_picture_url: str | None = None
    profile_picture_updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    birthdate: datetime | None = None
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None


class UserGroupIn(BaseModel):
    name: str
    discount_percent: float = 0.0
    coin_multiplier: float = 1.0
    postpay_allowed: bool = False


class UserGroupOut(UserGroupIn):
    id: int
    model_config = ConfigDict(from_attributes=True)


class MembershipPackageIn(BaseModel):
    name: str
    description: str | None = None
    price: float
    minutes_included: int | None = None
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
    minutes_remaining: int | None = None
    model_config = ConfigDict(from_attributes=True)
