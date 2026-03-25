"""
Script to update/create SuperAdmin user with specific credentials.
"""

import sys
import os

# Use localhost instead of 'db' when running outside Docker
os.environ["DATABASE_URL"] = "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_db"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from argon2 import PasswordHasher
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, Base

DATABASE_URL = os.environ["DATABASE_URL"]
print(f"Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

ph = PasswordHasher()

# The credentials the user wants to use
USERNAME_EMAIL = "PrimusHq"  # This will be used as both username and email lookup
PASSWORD = "QwAsZx.10"
ROLE = "superadmin"


def update_or_create_superadmin():
    db = SessionLocal()
    try:
        # Try to find existing user by email or name
        existing = db.query(User).filter(
            (User.email == USERNAME_EMAIL) | 
            (User.email == f"{USERNAME_EMAIL}@primushub.org") |
            (User.name == USERNAME_EMAIL)
        ).first()
        
        if existing:
            print(f"Found existing user: {existing.email} (ID: {existing.id})")
            existing.password_hash = ph.hash(PASSWORD)
            existing.role = ROLE
            db.commit()
            print(f"✅ Updated password and role for: {existing.email}")
            print(f"   Password: {PASSWORD}")
            print(f"   Role: {ROLE}")
        else:
            # Create new user with email format
            new_user = User(
                name=USERNAME_EMAIL,
                email=f"{USERNAME_EMAIL}@primushub.org",
                password_hash=ph.hash(PASSWORD),
                role=ROLE,
                is_email_verified=True,
                wallet_balance=0.0,
                coins_balance=0,
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            print(f"✅ Created new SuperAdmin user!")
            print(f"   ID: {new_user.id}")
            print(f"   Email: {new_user.email}")
            print(f"   Password: {PASSWORD}")
            print(f"   Role: {ROLE}")
        
        # Also check if we need to update the 'primus@primushub.org' user
        primus_user = db.query(User).filter(User.email == "primus@primushub.org").first()
        if primus_user:
            print(f"\nAlso updating primus@primushub.org for convenience...")
            primus_user.password_hash = ph.hash(PASSWORD)
            primus_user.role = ROLE
            db.commit()
            print(f"   Updated primus@primushub.org with same password")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    update_or_create_superadmin()
