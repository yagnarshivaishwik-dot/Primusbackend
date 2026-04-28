import os

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from starlette.config import Config

from app.db.global_db import global_session_factory as SessionLocal
from app.models import User

router = APIRouter()

config = Config(".env")

oauth = OAuth(config)

# Register providers
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    access_token_url="https://oauth2.googleapis.com/token",
    access_token_params=None,
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    authorize_params=None,
    api_base_url="https://www.googleapis.com/oauth2/v3/",
    client_kwargs={"scope": "openid email profile"},
)
oauth.register(
    name="discord",
    client_id=os.getenv("DISCORD_CLIENT_ID"),
    client_secret=os.getenv("DISCORD_CLIENT_SECRET"),
    access_token_url="https://discord.com/api/oauth2/token",
    authorize_url="https://discord.com/api/oauth2/authorize",
    api_base_url="https://discord.com/api/",
    client_kwargs={"scope": "identify email"},
)
oauth.register(
    name="twitter",
    client_id=os.getenv("TWITTER_CLIENT_ID"),
    client_secret=os.getenv("TWITTER_CLIENT_SECRET"),
    request_token_url="https://api.twitter.com/oauth/request_token",
    request_token_params=None,
    access_token_url="https://api.twitter.com/oauth/access_token",
    access_token_params=None,
    authorize_url="https://api.twitter.com/oauth/authorize",
    authorize_params=None,
    api_base_url="https://api.twitter.com/1.1/",
    client_kwargs=None,
)
# Apple OAuth requires more advanced setup; recommend starting with Google/Discord/Twitter.


# Helper to get or create user — with automatic account linking
def get_or_create_user(db, email, username, provider):
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Account linking: if user exists (e.g. registered via email/password)
        # and hasn't been linked to a social provider yet, link them now.
        # This prevents duplicate accounts for the same email.
        if not user.is_email_verified:
            user.is_email_verified = True
            db.commit()
        return user
    # Create new user
    user = User(
        name=username or email.split("@")[0],
        email=email,
        password_hash="oauth",  # mark as social login
        role="client",
        is_email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


from app.api.endpoints.auth import create_access_token


@router.get("/login/{provider}")
async def oauth_login(request: Request, provider: str, state: str | None = None):
    redirect_uri = request.url_for("auth_callback", provider=provider)
    client = oauth.create_client(provider)
    # Basic sanity for Google credentials to avoid 500s
    if provider == "google":
        cid = os.getenv("GOOGLE_CLIENT_ID")
        csec = os.getenv("GOOGLE_CLIENT_SECRET")
        if not cid or not csec:
            raise HTTPException(
                400,
                "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, and add redirect URI /api/social/auth/google in Google Cloud Console.",
            )
    try:
        # Pass state through so we can redirect back to a custom return URL in the callback
        return await client.authorize_redirect(request, redirect_uri, state=state)
    except Exception as e:
        # Preserve original error context for debugging
        raise HTTPException(400, f"OAuth init failed: {e}") from e


@router.get("/auth/{provider}")
async def auth_callback(request: Request, provider: str):
    db = SessionLocal()
    try:
        token = await oauth.create_client(provider).authorize_access_token(request)
        if provider == "google":
            userinfo = await oauth.google.parse_id_token(request, token)
            email = userinfo["email"]
            username = userinfo.get("name") or userinfo["email"].split("@")[0]
        elif provider == "discord":
            resp = await oauth.discord.get("users/@me", token=token)
            profile = resp.json()
            email = profile["email"]
            username = profile["username"]
        elif provider == "twitter":
            # Twitter returns in a different way; see docs for details.
            # Simplified for demonstration:
            resp = await oauth.twitter.get(
                "account/verify_credentials.json?include_email=true", token=token
            )
            profile = resp.json()
            email = profile.get("email")  # Twitter API may restrict email
            username = profile["screen_name"]
        else:
            raise HTTPException(400, "Provider not supported yet.")
        user = get_or_create_user(db, email, username, provider)
        access_token = create_access_token({"sub": user.email, "role": user.role})
        state = request.query_params.get("state")
        # Only allow redirects to whitelisted domains to prevent open redirect attacks
        allowed_redirects_str = os.getenv(
            "ALLOWED_REDIRECTS", "http://127.0.0.1,http://localhost,https://primustech.in"
        )
        allowed_redirects = [r.strip() for r in allowed_redirects_str.split(",") if r.strip()]
        if state and any(state.startswith(prefix) for prefix in allowed_redirects):
            # Redirect back to desktop listener with token for local capture
            return RedirectResponse(url=f"{state}?token={access_token}")
        # Fallback: return token JSON
        return {"access_token": access_token, "token_type": "bearer"}
    except OAuthError as err:
        # Wrap OAuth library errors with HTTPException while preserving context
        raise HTTPException(400, f"OAuth error: {err}") from err


class GoogleIdTokenIn(BaseModel):
    id_token: str
    client_id: str | None = None


@router.post("/google/idtoken")
def login_with_google_idtoken(payload: GoogleIdTokenIn):
    db = SessionLocal()
    try:
        audience = payload.client_id or os.getenv("GOOGLE_CLIENT_ID")
        if not audience:
            raise HTTPException(400, "GOOGLE_CLIENT_ID must be set in environment variables")
        claims = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), audience
        )
        email = claims.get("email")
        if not email:
            raise HTTPException(400, "Google token missing email")
        username = claims.get("name") or email.split("@")[0]
        user = get_or_create_user(db, email, username, "google")
        access_token = create_access_token({"sub": user.email, "role": user.role})
        return {"access_token": access_token, "token_type": "bearer"}
    except ValueError as err:
        # Invalid token format or signature
        raise HTTPException(400, "Invalid Google token") from err
    finally:
        db.close()


# ── Health / config probe ────────────────────────────────────────────
@router.get("/oauth/health")
def oauth_health():
    """Lightweight probe: which providers have their env vars wired.

    Useful as a post-deploy curl smoke-test:
        curl -s https://api.primustech.in/api/social/oauth/health

    Returns the *prefix* of the client ID (first 14 chars before the
    leading 6 digits) so operators can confirm the right credential
    landed without exposing the full ID. Never returns secrets.
    """
    def _prefix(value: str | None, n: int = 12) -> str | None:
        if not value:
            return None
        return value[:n] + "…"

    google_cid = os.getenv("GOOGLE_CLIENT_ID")
    google_csec = os.getenv("GOOGLE_CLIENT_SECRET")

    return {
        "google_configured": bool(google_cid),
        "google_client_id_prefix": _prefix(google_cid),
        "google_secret_present": bool(google_csec),
        "discord_configured": bool(os.getenv("DISCORD_CLIENT_ID")),
        "twitter_configured": bool(os.getenv("TWITTER_CLIENT_ID")),
    }
