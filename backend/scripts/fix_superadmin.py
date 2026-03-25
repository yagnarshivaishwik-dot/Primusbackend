"""Fix SuperAdmin user - set name to PrimusHq for username login."""
import sys, os
os.environ["DATABASE_URL"] = "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_db"
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
print(f"   Username (name): PrimusHq")
print(f"   Password: QwAsZx.10")
print(f"   Role: superadmin")
db.close()
