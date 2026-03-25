import secrets
import string
import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.api.endpoints.auth import _normalize_password, ph
from app.models import Cafe, License, User
from app.utils.email import send_welcome_email


def generate_random_password(length=12):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def generate_license_key():
    return str(uuid.uuid4()).upper()


async def onboard_cafe(db: Session, data):
    # 1. Create owner user
    temp_password = generate_random_password()
    hashed_password = ph.hash(_normalize_password(temp_password))

    owner = User(
        name=data.full_name,
        email=data.email,
        password_hash=hashed_password,
        role="admin",
        phone=data.mobile_number,
        is_email_verified=True,  # Verified since we send credentials here
    )
    db.add(owner)
    db.flush()  # Get owner.id

    # 2. Create cafe
    cafe = Cafe(
        name=data.cafe_name,
        location=data.cafe_location,
        phone=data.mobile_number,
        owner_id=owner.id,
    )
    db.add(cafe)
    db.flush()  # Get cafe.id

    # Update owner's cafe_id
    owner.cafe_id = cafe.id

    # 3. Create license
    license_key = generate_license_key()
    # Trial expires 30 days after first login, but we set a far future
    # initial expiry that gets updated on first login.
    # For now, let's just set it to 30 days from creation as a baseline.
    new_license = License(
        key=license_key,
        cafe_id=cafe.id,
        expires_at=datetime.utcnow() + timedelta(days=30),
        max_pcs=data.pc_count,
        is_active=True,
    )
    db.add(new_license)

    db.commit()

    # 4. Send welcome email
    await send_welcome_email(data.email, data.full_name, data.email, temp_password)

    return cafe, owner, license_key
