import os
import sys

from dotenv import load_dotenv

# Load .env, but do NOT override existing environment variables.
# This lets Docker Compose-provided DATABASE_URL win inside containers,
# while .env is used when running directly on the host.
load_dotenv()

# Environment detection
ENVIRONMENT = os.getenv("ENVIRONMENT", "").lower()
IS_PRODUCTION = ENVIRONMENT == "production"
IS_DEVELOPMENT = ENVIRONMENT == "development" or not IS_PRODUCTION

# PostgreSQL-only deployment for nginx-backed app:
# - DATABASE_URL is required and must point to a PostgreSQL instance.
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print(
        "ERROR: DATABASE_URL must be set and must point to a PostgreSQL database "
        "(e.g., postgresql+psycopg2://user:pass@host:port/dbname)",
        file=sys.stderr,
    )
    sys.exit(1)

if not DATABASE_URL.lower().startswith("postgresql"):
    print(
        f"ERROR: Primus backend is PostgreSQL-only; invalid DATABASE_URL: {DATABASE_URL!r}",
        file=sys.stderr,
    )
    sys.exit(1)


def _require_env_var(
    var_name: str, description: str | None = None, allow_dev_default: bool = False
) -> str:
    """
    Require environment variable, fail-fast in production if missing.

    Args:
        var_name: Environment variable name
        description: Human-readable description for error messages
        allow_dev_default: If True, allow weak default in development

    Returns:
        Environment variable value
    """
    value = os.getenv(var_name)

    if not value:
        if IS_PRODUCTION:
            error_msg = f"ERROR: {var_name} must be set in production"
            if description:
                error_msg += f" ({description})"
            print(error_msg, file=sys.stderr)
            sys.exit(1)

        if allow_dev_default and IS_DEVELOPMENT:
            # Only allow weak default for local development (never in production)
            dev_default = f"dev-{var_name.lower().replace('_', '-')}-change-in-production"
            print(
                f"WARNING: Using default {var_name} for local development only. "
                f"Set {var_name} in production!",
                file=sys.stderr,
            )
            return dev_default

        if IS_PRODUCTION or not allow_dev_default:
            error_msg = f"ERROR: {var_name} must be set"
            if description:
                error_msg += f" ({description})"
            print(error_msg, file=sys.stderr)
            sys.exit(1)

    if value is None:
        # Should not happen given the logic above; guard for type-checker and safety
        raise RuntimeError(f"{var_name} must be set")

    return value


# Required secrets in production - fail fast if missing
SECRET_KEY = _require_env_var(
    "SECRET_KEY", "Application secret key for session management", allow_dev_default=True
)
JWT_SECRET = _require_env_var("JWT_SECRET", "JWT token signing secret", allow_dev_default=True)

# JWT Configuration
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")  # Default to HS256, can be overridden
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120")
)  # 2 hours default

def load_from_file(filename: str):
    try:
        with open(filename) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass


# Load defaults from conf/ if present
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_from_file(os.path.join(base_dir, "conf", "payments.conf"))
load_from_file(os.path.join(base_dir, "conf", "oauth.conf"))

# Payment gateways
STRIPE_SECRET = os.getenv("STRIPE_SECRET", "")
STRIPE_CURRENCY = os.getenv("STRIPE_CURRENCY", "usd")
STRIPE_SUCCESS_URL = os.getenv("STRIPE_SUCCESS_URL", "https://example.com/success")
STRIPE_CANCEL_URL = os.getenv("STRIPE_CANCEL_URL", "https://example.com/cancel")

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_CURRENCY = os.getenv("RAZORPAY_CURRENCY", "INR")
RAZORPAY_SUCCESS_URL = os.getenv("RAZORPAY_SUCCESS_URL", "https://example.com/razorpay/success")

# OAuth providers (desktop flow)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

# Application URL
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
TWITTER_CLIENT_ID = os.getenv("TWITTER_CLIENT_ID", "")
TWITTER_CLIENT_SECRET = os.getenv("TWITTER_CLIENT_SECRET", "")
