"""Phase 3 mobile endpoints (consolidated).

Groups the smaller Phase 3 surfaces under one module so the v1 router
doesn't sprout a separate import per feature. The router is split into
sub-routers for clean prefixes:

    /api/v1/links/*         External account links (Steam, Riot, ...)
    /api/v1/ratings/*       Cafe ratings + reviews
    /api/v1/referrals/*     Referral code + conversions
    /api/v1/stats/mobile/*  Gaming stats dashboard (mobile-friendly)
    /api/v1/notifications/* In-app notification inbox

Each sub-router can be migrated to its own file when it grows beyond
~150 LOC. For now they're side-by-side because they share the same
auth + global-DB dependency wiring.
"""
from __future__ import annotations

import secrets
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.db.models_global import (
    CafeRating,
    ExternalAccount,
    NotificationInbox,
    ReferralCode,
    ReferralConversion,
    UserGlobal,
)


# =============================================================================
# Sub-router 1: External Game Links (Steam, Riot, Battle.net, Epic)
# =============================================================================
links_router = APIRouter()

VALID_PROVIDERS = {"steam", "riot", "battlenet", "epic"}


class LinkIn(BaseModel):
    provider: str = Field(..., min_length=2, max_length=32)
    external_id: str = Field(..., min_length=1, max_length=128)
    display_name: str | None = Field(None, max_length=128)
    avatar_url: str | None = None


class LinkOut(BaseModel):
    id: int
    provider: str
    external_id: str
    display_name: str | None
    avatar_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@links_router.get("/", response_model=list[LinkOut])
def list_links(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(ExternalAccount)
        .filter(ExternalAccount.user_id == current_user.id)
        .all()
    )
    return rows


@links_router.post("/", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
def link_account(
    body: LinkIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Provider must be one of {sorted(VALID_PROVIDERS)}",
        )
    existing = (
        db.query(ExternalAccount)
        .filter(
            ExternalAccount.user_id == current_user.id,
            ExternalAccount.provider == body.provider,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"You already have a {body.provider} account linked",
        )
    row = ExternalAccount(
        user_id=current_user.id,
        provider=body.provider,
        external_id=body.external_id,
        display_name=body.display_name,
        avatar_url=body.avatar_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@links_router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_account(
    link_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(ExternalAccount).filter(ExternalAccount.id == link_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Link not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your link")
    db.delete(row)
    db.commit()
    return None


# =============================================================================
# Sub-router 2: Cafe Ratings
# =============================================================================
ratings_router = APIRouter()


class RatingIn(BaseModel):
    cafe_id: int
    stars: int = Field(..., ge=1, le=5)
    comment: str | None = Field(None, max_length=2000)


class RatingOut(BaseModel):
    id: int
    user_id: int
    cafe_id: int
    stars: int
    comment: str | None
    created_at: datetime
    updated_at: datetime
    user_name: str | None = None

    model_config = {"from_attributes": True}


class RatingSummaryOut(BaseModel):
    cafe_id: int
    average_stars: float
    rating_count: int
    distribution: dict[int, int]  # 1..5 -> count


@ratings_router.post("/", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def upsert_rating(
    body: RatingIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update the current user's rating for a cafe (one per pair)."""
    existing = (
        db.query(CafeRating)
        .filter(
            CafeRating.user_id == current_user.id,
            CafeRating.cafe_id == body.cafe_id,
        )
        .first()
    )
    if existing:
        existing.stars = body.stars
        existing.comment = body.comment
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        out = RatingOut.model_validate(existing)
        out.user_name = getattr(current_user, "name", None)
        return out

    row = CafeRating(
        user_id=current_user.id,
        cafe_id=body.cafe_id,
        stars=body.stars,
        comment=body.comment,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    out = RatingOut.model_validate(row)
    out.user_name = getattr(current_user, "name", None)
    return out


@ratings_router.get("/cafe/{cafe_id}", response_model=list[RatingOut])
def list_ratings_for_cafe(
    cafe_id: int,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CafeRating)
        .filter(CafeRating.cafe_id == cafe_id)
        .order_by(CafeRating.updated_at.desc())
        .limit(limit)
        .all()
    )
    user_ids = {r.user_id for r in rows}
    users = (
        {u.id: u for u in db.query(UserGlobal).filter(UserGlobal.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )
    out: list[RatingOut] = []
    for r in rows:
        o = RatingOut.model_validate(r)
        o.user_name = getattr(users.get(r.user_id), "name", None)
        out.append(o)
    return out


@ratings_router.get("/cafe/{cafe_id}/summary", response_model=RatingSummaryOut)
def cafe_rating_summary(cafe_id: int, db: Session = Depends(get_db)):
    rows = db.query(CafeRating.stars).filter(CafeRating.cafe_id == cafe_id).all()
    if not rows:
        return RatingSummaryOut(
            cafe_id=cafe_id,
            average_stars=0.0,
            rating_count=0,
            distribution={i: 0 for i in range(1, 6)},
        )
    stars_list = [int(r[0]) for r in rows]
    dist: dict[int, int] = {i: 0 for i in range(1, 6)}
    for s in stars_list:
        dist[s] = dist.get(s, 0) + 1
    return RatingSummaryOut(
        cafe_id=cafe_id,
        average_stars=round(sum(stars_list) / len(stars_list), 2),
        rating_count=len(stars_list),
        distribution=dist,
    )


# =============================================================================
# Sub-router 3: Referrals
# =============================================================================
referrals_router = APIRouter()

REFERRAL_REWARD_COINS = 100
CODE_ALPHABET = string.ascii_uppercase + string.digits  # no lowercase to avoid confusion


def _generate_unique_code(db: Session, length: int = 8) -> str:
    """Generate a referral code that doesn't collide with an existing one."""
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        if not db.query(ReferralCode).filter(ReferralCode.code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Could not generate unique code")


class ReferralCodeOut(BaseModel):
    code: str
    share_url: str
    conversions: int


class ApplyReferralIn(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)


class ApplyReferralOut(BaseModel):
    success: bool
    coins_awarded: int
    referrer_name: str | None = None


@referrals_router.get("/me", response_model=ReferralCodeOut)
def get_my_code(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Get or lazily-create the current user's referral code."""
    row = (
        db.query(ReferralCode)
        .filter(ReferralCode.user_id == current_user.id)
        .first()
    )
    if not row:
        row = ReferralCode(user_id=current_user.id, code=_generate_unique_code(db))
        db.add(row)
        db.commit()
        db.refresh(row)

    conversions = (
        db.query(ReferralConversion)
        .filter(ReferralConversion.referrer_user_id == current_user.id)
        .count()
    )
    return ReferralCodeOut(
        code=row.code,
        share_url=f"https://primustech.in/r/{row.code}",
        conversions=conversions,
    )


@referrals_router.post("/apply", response_model=ApplyReferralOut)
def apply_referral_code(
    body: ApplyReferralIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a referral code (only once per user, only as a new account)."""
    code_row = (
        db.query(ReferralCode)
        .filter(ReferralCode.code == body.code.upper())
        .first()
    )
    if not code_row:
        raise HTTPException(status_code=404, detail="Code not found")
    if code_row.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own code")

    # Check user is "new enough" -- must have joined in last 7 days to apply
    user_age = datetime.utcnow() - getattr(current_user, "created_at", datetime.utcnow())
    if user_age > timedelta(days=7):
        raise HTTPException(
            status_code=400,
            detail="Referral codes can only be applied within 7 days of signup",
        )

    # Check this user hasn't already converted
    existing = (
        db.query(ReferralConversion)
        .filter(ReferralConversion.referred_user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="You have already used a referral code")

    conversion = ReferralConversion(
        referrer_user_id=code_row.user_id,
        referred_user_id=current_user.id,
        code=code_row.code,
        coins_awarded=REFERRAL_REWARD_COINS,
    )
    db.add(conversion)

    # Award coins to BOTH parties
    referrer = db.query(UserGlobal).filter(UserGlobal.id == code_row.user_id).first()
    if referrer:
        referrer.coins_balance = (referrer.coins_balance or 0) + REFERRAL_REWARD_COINS

    me = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    if me:
        me.coins_balance = (me.coins_balance or 0) + REFERRAL_REWARD_COINS

    db.commit()
    return ApplyReferralOut(
        success=True,
        coins_awarded=REFERRAL_REWARD_COINS,
        referrer_name=getattr(referrer, "name", None),
    )


# =============================================================================
# Sub-router 4: Mobile Stats Dashboard
# =============================================================================
stats_router = APIRouter()


class StatsOverviewOut(BaseModel):
    total_hours: float
    total_sessions: int
    total_bookings: int
    favorite_game: str | None
    coins_earned: int
    coins_balance: int
    rank_in_top: int | None  # global leaderboard rank, if computed
    streak_days: int
    last_session_at: datetime | None


def compute_tier(coins: int) -> str:
    """Pure function — single source of truth for tier mapping.

    Mirror of the Flutter `tierForCoins` in
    features/rewards/presentation/widgets/tier_badge.dart.
    """
    if coins >= 5000:
        return "Platinum"
    if coins >= 2000:
        return "Gold"
    if coins >= 500:
        return "Silver"
    return "Bronze"


@stats_router.get("/overview", response_model=StatsOverviewOut)
def stats_overview(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """High-level stats for the rewards dashboard.

    Aggregates across the user's wallet (global) and any per-cafe sessions
    accessible from the current request context. Heavy computation
    (favorite_game, rank_in_top) is best-effort.
    """
    me = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    coins_balance = int(getattr(me, "coins_balance", 0) or 0)

    # Coins earned == accumulated topup+award transactions (best-effort).
    coins_earned = coins_balance  # default fallback
    try:
        from app.models import WalletTransaction
        rows = (
            db.query(WalletTransaction)
            .filter(WalletTransaction.user_id == current_user.id)
            .filter(WalletTransaction.coins > 0)
            .all()
        )
        if rows:
            coins_earned = sum(int(r.coins or 0) for r in rows)
    except Exception:
        pass

    # Streak + sessions + last_session_at: best-effort across cafes.
    # In the multi-tenant model, a true cross-cafe aggregate requires
    # either a denormalized per-user activity table or fan-out. For
    # the dashboard MVP we surface zeros and rely on the per-cafe stats
    # endpoint when the user is in a specific cafe context.
    streak_days = 0
    total_sessions = 0
    total_bookings = 0
    total_hours = 0.0
    last_session_at: datetime | None = None
    favorite_game: str | None = None

    # Rank: position by coins_balance among all users (cheap with index).
    rank_in_top: int | None = None
    try:
        higher = (
            db.query(UserGlobal)
            .filter(UserGlobal.coins_balance > coins_balance)
            .count()
        )
        rank_in_top = higher + 1
    except Exception:
        pass

    return StatsOverviewOut(
        total_hours=total_hours,
        total_sessions=total_sessions,
        total_bookings=total_bookings,
        favorite_game=favorite_game,
        coins_earned=coins_earned,
        coins_balance=coins_balance,
        rank_in_top=rank_in_top,
        streak_days=streak_days,
        last_session_at=last_session_at,
    )


@stats_router.get("/tier")
def my_tier(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Return current loyalty tier + the next-tier threshold.

    Used by the mobile rewards page to render the tier badge consistently
    with the backend's authoritative thresholds.
    """
    me = db.query(UserGlobal).filter(UserGlobal.id == current_user.id).first()
    coins = int(getattr(me, "coins_balance", 0) or 0)
    tier = compute_tier(coins)
    next_threshold = {"Bronze": 500, "Silver": 2000, "Gold": 5000, "Platinum": None}[tier]
    current_threshold = {"Bronze": 0, "Silver": 500, "Gold": 2000, "Platinum": 5000}[tier]
    progress = 1.0 if next_threshold is None else (
        (coins - current_threshold) / (next_threshold - current_threshold)
    )
    return {
        "coins": coins,
        "tier": tier,
        "current_threshold": current_threshold,
        "next_threshold": next_threshold,
        "progress": round(progress, 4),
    }


# =============================================================================
# Sub-router 5: In-app notifications inbox
# =============================================================================
inbox_router = APIRouter()


class NotificationOut(BaseModel):
    id: int
    title: str
    body: str
    deep_link: str | None
    category: str | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@inbox_router.get("/", response_model=list[NotificationOut])
def list_notifications(
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = False,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(NotificationInbox).filter(NotificationInbox.user_id == current_user.id)
    if unread_only:
        q = q.filter(NotificationInbox.is_read.is_(False))
    rows = q.order_by(NotificationInbox.created_at.desc()).limit(limit).all()
    return rows


@inbox_router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(NotificationInbox)
        .filter(NotificationInbox.id == notification_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your notification")
    if not row.is_read:
        row.is_read = True
        row.read_at = datetime.utcnow()
        db.commit()
    return None


@inbox_router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    (
        db.query(NotificationInbox)
        .filter(NotificationInbox.user_id == current_user.id)
        .filter(NotificationInbox.is_read.is_(False))
        .update({"is_read": True, "read_at": now})
    )
    db.commit()
    return None


@inbox_router.get("/unread-count")
def unread_count(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = (
        db.query(NotificationInbox)
        .filter(NotificationInbox.user_id == current_user.id)
        .filter(NotificationInbox.is_read.is_(False))
        .count()
    )
    return {"unread": n}


def write_inbox(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    category: str | None = None,
    deep_link: str | None = None,
) -> NotificationInbox:
    """Helper for push tasks / business logic to persist a notification."""
    row = NotificationInbox(
        user_id=user_id,
        title=title,
        body=body,
        category=category,
        deep_link=deep_link,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
