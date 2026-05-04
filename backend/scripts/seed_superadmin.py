"""
Seed (or update) the Primus SuperAdmin user against the global Postgres
database. Designed for the post-Azure-migration environment.

Why this exists
---------------
The existing scripts (create_superadmin.py, fix_superadmin.py,
update_superadmin.py, create_superadmin_docker.py) all hard-code a
localhost / docker-host DATABASE_URL and embed plaintext passwords in
source. None of them work cleanly against the Azure-hosted Postgres
without manual editing, and they all import the deprecated
`app.models.User` directly.

This script:
  * Reads the database URL from the environment ONLY
    (GLOBAL_DATABASE_URL preferred, falls back to DATABASE_URL).
  * Reads the superadmin password from the environment or argparse,
    never from a hard-coded literal.
  * Idempotent: creates the user if missing, updates role/password
    when --force is passed.
  * Writes through the global session factory used by the running
    backend, so it works for both single-DB and multi-DB modes.
  * Hashes the password with Argon2 to match
    `app.api.endpoints.auth.authenticate_user` expectations
    (sha256(utf-8) -> argon2 hash).
  * Emits an audit_logs row so the privileged action is traceable.

Usage examples
--------------
    # Azure VM (env from /etc/primus/primus.env or backend/.env):
    GLOBAL_DATABASE_URL=postgresql+psycopg2://primus_user:***@host:5432/primus_global \
    SUPERADMIN_EMAIL=admin@primusadmin.in \
    SUPERADMIN_USERNAME=primus \
    SUPERADMIN_PASSWORD='change-me-now' \
    python scripts/seed_superadmin.py

    # Update an existing record's password and role:
    SUPERADMIN_PASSWORD='new-secret' python scripts/seed_superadmin.py --force

    # Dry-run (no writes):
    python scripts/seed_superadmin.py --dry-run

Exit codes
----------
    0  success (created or updated)
    1  validation / configuration error
    2  database error
    3  user already exists and --force not passed
"""

from __future__ import annotations

import argparse
import getpass
import hashlib
import logging
import os
import sys
from datetime import datetime

# Make the backend importable regardless of cwd.
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(HERE)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("seed_superadmin")


# ----- Defaults (NON-secret) -----------------------------------------------
DEFAULT_USERNAME = "primus"
DEFAULT_EMAIL = "admin@primusadmin.in"
DEFAULT_FIRST_NAME = "Primus"
DEFAULT_LAST_NAME = "Admin"
ROLE = "superadmin"
MIN_PASSWORD_LENGTH = 12


def _normalize_password(password: str) -> str:
    """Mirror app.api.endpoints.auth._normalize_password exactly."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _resolve_db_url() -> str:
    url = os.getenv("GLOBAL_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        log.error(
            "Neither GLOBAL_DATABASE_URL nor DATABASE_URL is set. "
            "Source your backend .env (Azure VM: backend/.env) before running.",
        )
        sys.exit(1)
    if not url.lower().startswith("postgresql"):
        log.error("Only PostgreSQL URLs are supported. Got: %s", url.split("@")[0])
        sys.exit(1)
    return url


def _resolve_password(cli_value: str | None, allow_prompt: bool) -> str:
    pw = cli_value or os.getenv("SUPERADMIN_PASSWORD")
    if not pw and allow_prompt and sys.stdin.isatty():
        pw = getpass.getpass("New SuperAdmin password (>= 12 chars): ")
        confirm = getpass.getpass("Confirm password: ")
        if pw != confirm:
            log.error("Passwords do not match.")
            sys.exit(1)
    if not pw:
        log.error(
            "No password provided. Set SUPERADMIN_PASSWORD env var, pass --password, "
            "or run interactively.",
        )
        sys.exit(1)
    if len(pw) < MIN_PASSWORD_LENGTH:
        log.error("Password must be >= %d characters.", MIN_PASSWORD_LENGTH)
        sys.exit(1)
    return pw


def _safe_log_action(db, user_id, action: str, details: str) -> None:
    """Emit an audit row if the audit_logs table exists, otherwise no-op."""
    try:
        from app.api.endpoints.audit import log_action  # type: ignore

        log_action(db, user_id, action, details, ip_address=None)
    except Exception as exc:  # pragma: no cover
        log.warning("Could not write audit log entry: %s", exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the Primus SuperAdmin user.")
    parser.add_argument(
        "--username",
        default=os.getenv("SUPERADMIN_USERNAME", DEFAULT_USERNAME),
        help="Username (also stored as User.name). Default: %(default)s",
    )
    parser.add_argument(
        "--email",
        default=os.getenv("SUPERADMIN_EMAIL", DEFAULT_EMAIL),
        help="Email. Default: %(default)s",
    )
    parser.add_argument(
        "--first-name",
        default=os.getenv("SUPERADMIN_FIRST_NAME", DEFAULT_FIRST_NAME),
    )
    parser.add_argument(
        "--last-name",
        default=os.getenv("SUPERADMIN_LAST_NAME", DEFAULT_LAST_NAME),
    )
    parser.add_argument(
        "--password",
        default=None,
        help="If omitted, falls back to SUPERADMIN_PASSWORD or interactive prompt.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="If the user already exists, overwrite password/role/name.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not commit; print the action that would be taken.",
    )
    parser.add_argument(
        "--no-prompt",
        action="store_true",
        help="Disable interactive password prompt (useful for CI).",
    )
    args = parser.parse_args()

    db_url = _resolve_db_url()
    password = _resolve_password(args.password, allow_prompt=not args.no_prompt)

    # Defer heavy imports until after env validation.
    try:
        from argon2 import PasswordHasher
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
    except Exception as exc:
        log.error(
            "Required Python packages not installed (argon2-cffi, sqlalchemy). "
            "Install backend requirements first. (%s)",
            exc,
        )
        return 2

    # Use the legacy User model — that is the model the live
    # `authenticate_user` helper queries (see app/api/endpoints/auth.py).
    # Both app.models.User and app.db.models_global.UserGlobal point at the
    # SAME `users` table, so writing here is correct in both single-DB and
    # multi-DB modes (provided GLOBAL_DATABASE_URL is set in multi-DB mode).
    try:
        from app.models import User  # noqa: F401  (legacy model — intentional)
    except Exception as exc:
        log.error("Could not import app.models.User: %s", exc)
        return 2

    sanitized = db_url.split("@", 1)[-1] if "@" in db_url else db_url
    log.info("Connecting to %s", sanitized)
    engine = create_engine(db_url, pool_pre_ping=True, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = SessionLocal()
    ph = PasswordHasher()

    try:
        # Match the production lookup exactly: name OR email.
        existing = (
            db.query(User)
            .filter((User.email == args.email) | (User.name == args.username))
            .first()
        )

        password_hash = ph.hash(_normalize_password(password))
        action_taken: str

        if existing:
            if not args.force:
                log.error(
                    "User already exists (id=%s, email=%s). Re-run with --force to "
                    "overwrite password/role/name.",
                    existing.id,
                    existing.email,
                )
                return 3
            existing.name = args.username
            existing.email = args.email
            existing.role = ROLE
            existing.password_hash = password_hash
            if hasattr(existing, "first_name"):
                existing.first_name = args.first_name
            if hasattr(existing, "last_name"):
                existing.last_name = args.last_name
            if hasattr(existing, "is_email_verified"):
                existing.is_email_verified = True
            action_taken = "update"
            log.info("Will UPDATE user id=%s email=%s", existing.id, args.email)
        else:
            new_user = User(
                name=args.username,
                email=args.email,
                role=ROLE,
                password_hash=password_hash,
                first_name=args.first_name,
                last_name=args.last_name,
                is_email_verified=True,
                wallet_balance=0.0,
                coins_balance=0,
            )
            db.add(new_user)
            action_taken = "create"
            log.info("Will CREATE user email=%s username=%s", args.email, args.username)

        if args.dry_run:
            log.warning("--dry-run set. Rolling back without committing.")
            db.rollback()
            return 0

        db.flush()
        target_user = existing or db.query(User).filter(User.email == args.email).first()
        _safe_log_action(
            db,
            target_user.id if target_user else None,
            f"superadmin_{action_taken}",
            f"SuperAdmin {action_taken} via seed_superadmin.py at {datetime.utcnow().isoformat()}Z",
        )
        db.commit()
        log.info(
            "OK SuperAdmin %sd. id=%s email=%s username=%s role=%s",
            action_taken,
            (target_user.id if target_user else "?"),
            args.email,
            args.username,
            ROLE,
        )
        log.info(
            "Login at the SuperAdmin portal with username=%s (or email=%s).",
            args.username,
            args.email,
        )
        return 0

    except Exception as exc:
        db.rollback()
        log.exception("Database error while seeding SuperAdmin: %s", exc)
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
