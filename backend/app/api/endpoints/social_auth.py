from __future__ import annotations

import os
from datetime import datetime

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.config import Config

from app.conf.oauth_apple import AppleAuthError, verify_apple_id_token
from app.db.global_db import global_session_factory as SessionLocal
from app.models import User
from app.schemas.user import UserOut

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
# Apple OAuth (native mobile): see POST /apple/exchange below. Server-side
# web redirect flow is intentionally not registered here — mobile apps use
# the native Sign in with Apple SDK and post the resulting id_token.


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


# ---- Mobile-native exchange helpers -----------------------------------------

def _issue_session_tokens(
    db: Session,
    user: User,
    *,
    ip_address: str | None = None,
) -> tuple[str, str]:
    """Issue an enriched access + refresh token pair for a freshly
    authenticated OAuth user via the shared token helper used by /login.

    This deliberately does NOT duplicate JWT signing logic — it reuses the
    shared helpers in app.auth.tokens.
    """
    from app.auth.tokens import (
        create_access_token as _create_enriched_access,
        create_refresh_token as _create_refresh,
    )

    access = _create_enriched_access(
        email=user.email,
        user_id=user.id,
        cafe_id=getattr(user, "cafe_id", None),
        device_id=None,
        role=user.role or "client",
    )
    refresh = _create_refresh(
        db,
        user_id=user.id,
        cafe_id=getattr(user, "cafe_id", None),
        device_id=None,
        ip_address=ip_address,
    )
    return access, refresh


def _upsert_oauth_user(
    db: Session,
    *,
    provider: str,
    sub: str | None,
    email: str | None,
    display_name: str | None,
) -> User:
    """Upsert a user by (provider_sub, email) for native mobile OAuth.

    Lookup order:
        1. By provider_sub (apple_sub / google_sub) — most stable identifier.
        2. By email — link existing account and persist the new sub.
        3. Create a new user.

    For Apple, email is only returned on the first sign-in and may be a
    private-relay address (e.g. abc123@privaterelay.appleid.com). We still
    accept and store it, and fall back to the sub as the address anchor
    when email is missing on subsequent logins.
    """
    if not sub:
        raise HTTPException(status_code=401, detail="Missing OAuth subject")

    sub_field = {"apple": "apple_sub", "google": "google_sub"}.get(provider)
    if sub_field is None:
        raise HTTPException(status_code=400, detail="Unsupported provider")

    # 1. Lookup by stable provider sub.
    user = db.query(User).filter(getattr(User, sub_field) == sub).first()
    if user is not None:
        # Keep email fresh if the provider now gives us one and we didn't
        # have it before (common for Apple: email only arrives on first
        # login).
        if email and not user.email:
            user.email = email
        # Back-fill name if missing.
        if display_name and not user.name:
            user.name = display_name
        if not user.is_email_verified:
            user.is_email_verified = True
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # 2. Link by email.
    if email:
        user = db.query(User).filter(User.email == email).first()
        if user is not None:
            setattr(user, sub_field, sub)
            if not user.is_email_verified:
                user.is_email_verified = True
            if display_name and not user.name:
                user.name = display_name
            db.add(user)
            db.commit()
            db.refresh(user)
            return user

    # 3. Create. Apple may not give us an email after the first sign-in —
    # fall back to a stable, provider-scoped placeholder so NOT NULL holds.
    effective_email = email or f"{provider}:{sub}"
    effective_name = (
        display_name
        or (email.split("@")[0] if email else f"{provider}_user_{sub[:8]}")
    )

    new_user = User(
        name=effective_name,
        email=effective_email,
        password_hash="oauth",
        role="client",
        is_email_verified=bool(email),
    )
    setattr(new_user, sub_field, sub)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ---- Legacy web-redirect OAuth flow (unchanged) -----------------------------


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


# ---- Legacy Google ID-token endpoint ----------------------------------------
# DEPRECATED for mobile clients: prefer POST /google/mobile-exchange which
# supports multiple audiences (iOS / Android / web client IDs), issues the
# same enriched access + refresh token pair as /login, and returns a full
# UserOut. Left in place for backwards compatibility with existing callers.


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


# ---- Mobile-native exchange endpoints ---------------------------------------


class AppleExchangeIn(BaseModel):
    id_token: str
    nonce: str | None = None
    # Apple returns the human name only on the very first authorization
    # screen; the mobile SDK surfaces it separately from the id_token.
    name: str | None = None


class GoogleMobileExchangeIn(BaseModel):
    id_token: str
    nonce: str | None = None


class MobileExchangeOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


def _allowed_google_audiences() -> list[str]:
    """Audiences accepted for mobile Google id_tokens.

    Any of the configured Android / iOS / web client IDs is considered a
    valid audience, because Google issues the id_token with aud = whichever
    platform client ID the user signed in through.
    """
    candidates = [
        os.getenv("GOOGLE_MOBILE_ANDROID_CLIENT_ID"),
        os.getenv("GOOGLE_MOBILE_IOS_CLIENT_ID"),
        os.getenv("GOOGLE_CLIENT_ID"),
    ]
    return [c for c in candidates if c]


@router.post("/apple/exchange", response_model=MobileExchangeOut)
async def apple_exchange(payload: AppleExchangeIn, request: Request):
    """Native mobile Apple Sign-In exchange.

    Validates the id_token via Apple JWKS (signature, iss, aud, exp) and
    optional nonce, upserts the user by apple_sub (falling back to email
    linkage), and issues the same JWT pair as /api/auth/login.
    """
    db = SessionLocal()
    try:
        try:
            claims = await verify_apple_id_token(
                payload.id_token, expected_nonce=payload.nonce
            )
        except AppleAuthError as err:
            raise HTTPException(status_code=401, detail=err.detail) from err

        sub = claims.get("sub")
        email = claims.get("email")
        client_ip = str(request.client.host) if request.client else None

        user = _upsert_oauth_user(
            db,
            provider="apple",
            sub=sub,
            email=email,
            display_name=payload.name,
        )
        access, refresh = _issue_session_tokens(db, user, ip_address=client_ip)
        return MobileExchangeOut(
            access_token=access,
            refresh_token=refresh,
            user=UserOut.model_validate(user),
        )
    finally:
        db.close()


@router.post("/google/mobile-exchange", response_model=MobileExchangeOut)
def google_mobile_exchange(payload: GoogleMobileExchangeIn, request: Request):
    """Native mobile Google Sign-In exchange.

    Verifies the id_token via google-auth and accepts any of the
    configured platform audiences (Android / iOS / web). Issues the same
    JWT pair as /api/auth/login.
    """
    allowed = _allowed_google_audiences()
    if not allowed:
        raise HTTPException(
            status_code=500,
            detail="Google mobile OAuth not configured. Set GOOGLE_CLIENT_ID or GOOGLE_MOBILE_(ANDROID|IOS)_CLIENT_ID.",
        )

    # google-auth accepts either a single audience string or a list of
    # audiences via the `audience` parameter.
    try:
        claims = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), allowed
        )
    except ValueError as err:
        raise HTTPException(status_code=401, detail="Invalid Google token") from err

    # Defense-in-depth: verify audience is in the allow list (some versions
    # of google-auth only check against a single audience if one is passed).
    aud = claims.get("aud")
    if aud not in allowed:
        raise HTTPException(status_code=401, detail="Google token audience not allowed")

    # Defense-in-depth: enforce nonce if provided by the caller.
    if payload.nonce is not None:
        if claims.get("nonce") != payload.nonce:
            raise HTTPException(status_code=401, detail="Google token nonce mismatch")

    # Defense-in-depth: explicit expiry check (verify_oauth2_token does this
    # but re-verify to catch clock-skew edge cases).
    exp = claims.get("exp")
    if exp is not None and int(exp) < int(datetime.utcnow().timestamp()):
        raise HTTPException(status_code=401, detail="Google token expired")

    sub = claims.get("sub")
    email = claims.get("email")
    display_name = claims.get("name") or (email.split("@")[0] if email else None)
    client_ip = str(request.client.host) if request.client else None

    db = SessionLocal()
    try:
        user = _upsert_oauth_user(
            db,
            provider="google",
            sub=sub,
            email=email,
            display_name=display_name,
        )
        access, refresh = _issue_session_tokens(db, user, ip_address=client_ip)
        return MobileExchangeOut(
            access_token=access,
            refresh_token=refresh,
            user=UserOut.model_validate(user),
        )
    finally:
        db.close()
