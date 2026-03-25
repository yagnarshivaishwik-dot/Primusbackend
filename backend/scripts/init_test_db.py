"""
Ensure the PostgreSQL test database for Primus exists.

This is used when running the backend test suite against PostgreSQL
instead of the default SQLite test DB. It creates the database named
in TEST_DATABASE_URL (default: primus_test_db) if it does not exist.
"""

import os
import sys

import sqlalchemy as sa
from sqlalchemy.engine import make_url


def main() -> None:
    # Default DSN matches the one we use in tests when overriding TEST_DATABASE_URL
    test_dsn = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql+psycopg2://primus_user:PrimusDbSecureP4ssw0rd!@localhost:5432/primus_test_db",
    )

    url = make_url(test_dsn)
    if url.drivername.split("+", 1)[0] != "postgresql":
        print(f"TEST_DATABASE_URL must be PostgreSQL, got {url.drivername!r}", file=sys.stderr)
        sys.exit(1)

    db_name = url.database
    admin_url = url.set(database="postgres")

    print(f"Ensuring PostgreSQL test database {db_name!r} exists using {admin_url} ...")
    admin_engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT", future=True)
    with admin_engine.connect() as conn:
        result = conn.execute(
            sa.text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
        )
        exists = result.scalar() == 1
        if not exists:
            conn.execute(sa.text(f'CREATE DATABASE "{db_name}"'))
            print(f"Created test database {db_name!r}")
        else:
            print(f"Test database {db_name!r} already exists")


if __name__ == "__main__":
    main()
