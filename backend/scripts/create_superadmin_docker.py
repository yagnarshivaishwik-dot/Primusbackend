"""
Create SuperAdmin user for production (Docker environment).
Run inside Docker container: python scripts/create_superadmin_docker.py
"""
import os
import sys

# Use Docker hostname 'db' for database
os.environ["DATABASE_URL"] = "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@db:5432/primus_db"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from argon2 import PasswordHasher
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import User

engine = create_engine(os.environ["DATABASE_URL"])
Session = sessionmaker(bind=engine)
db = Session()
ph = PasswordHasher()

# Create/update user with name = "PrimusHq" (for username login)
user = db.query(User).filter(User.name == "PrimusHq").first()
if not user:
    user = User(
        name="PrimusHq",
        email="primushq@primushub.org",
        role="superadmin",
        is_email_verified=True,
        wallet_balance=0.0,
        coins_balance=0,
    )
    db.add(user)

user.password_hash = ph.hash("QwAsZx.10")
user.role = "superadmin"
db.commit()

print("✅ SuperAdmin created/updated!")
print("   Username: PrimusHq")
print("   Password: QwAsZx.10")
print("   Role: superadmin")
db.close()
