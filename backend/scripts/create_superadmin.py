"""
Script to create a SuperAdmin user for the Primus system.

Usage:
    cd k:\lance\backend
    python scripts/create_superadmin.py
    
    Or with a custom DATABASE_URL:
    DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/primus_db python scripts/create_superadmin.py
"""

import sys
import os

# Override DATABASE_URL if running locally (not in Docker)
# Use localhost instead of 'db' when running outside Docker
if not os.getenv("DATABASE_URL") or "db:" in os.getenv("DATABASE_URL", ""):
    os.environ["DATABASE_URL"] = "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_db"

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from argon2 import PasswordHasher
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import User, Base

# Create engine with local connection
DATABASE_URL = os.environ["DATABASE_URL"]
print(f"Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else DATABASE_URL}")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Ensure tables exist
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Note: Could not create tables (may already exist): {e}")

ph = PasswordHasher()

# SuperAdmin credentials
SUPERADMIN_NAME = "Primus"
SUPERADMIN_EMAIL = "primus@primushub.org"
SUPERADMIN_PASSWORD = "Vaishwik@123"
SUPERADMIN_ROLE = "superadmin"


def create_superadmin():
    db: Session = SessionLocal()
    try:
        # Check if user already exists
        existing = db.query(User).filter(User.email == SUPERADMIN_EMAIL).first()
        
        if existing:
            print(f"User with email '{SUPERADMIN_EMAIL}' already exists.")
            print(f"  ID: {existing.id}")
            print(f"  Name: {existing.name}")
            print(f"  Role: {existing.role}")
            
            # Update password and role if needed
            update = input("Update password and role to superadmin? (y/n): ").strip().lower()
            if update == 'y':
                existing.password_hash = ph.hash(SUPERADMIN_PASSWORD)
                existing.role = SUPERADMIN_ROLE
                existing.name = SUPERADMIN_NAME
                db.commit()
                print("✅ User updated successfully!")
                print(f"   Email: {SUPERADMIN_EMAIL}")
                print(f"   Password: {SUPERADMIN_PASSWORD}")
                print(f"   Role: {SUPERADMIN_ROLE}")
            return
        
        # Create new superadmin user
        new_user = User(
            name=SUPERADMIN_NAME,
            email=SUPERADMIN_EMAIL,
            password_hash=ph.hash(SUPERADMIN_PASSWORD),
            role=SUPERADMIN_ROLE,
            is_email_verified=True,
            wallet_balance=0.0,
            coins_balance=0,
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        print("✅ SuperAdmin user created successfully!")
        print(f"   ID: {new_user.id}")
        print(f"   Name: {SUPERADMIN_NAME}")
        print(f"   Email: {SUPERADMIN_EMAIL}")
        print(f"   Password: {SUPERADMIN_PASSWORD}")
        print(f"   Role: {SUPERADMIN_ROLE}")
        
    except Exception as e:
        print(f"❌ Error creating superadmin: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_superadmin()
