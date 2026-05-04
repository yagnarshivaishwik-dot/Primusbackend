"""Friend graph endpoints for the mobile app.

All endpoints operate on the *global* DB because friendships span cafes.
Authentication is required for all routes.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.db.models_global import Friendship, UserGlobal
from app.schemas.social import FriendOut, FriendRequestIn

router = APIRouter()


def _to_out(row: Friendship, me_id: int, other_user: UserGlobal | None) -> FriendOut:
    is_outgoing = row.requester_id == me_id
    other_id = row.addressee_id if is_outgoing else row.requester_id
    return FriendOut(
        id=row.id,
        user_id=other_id,
        user_name=getattr(other_user, "name", None) if other_user else None,
        user_email=getattr(other_user, "email", None) if other_user else None,
        status=row.status,
        direction="outgoing" if is_outgoing else "incoming",
        created_at=row.created_at,
        accepted_at=row.accepted_at,
    )


@router.get("/", response_model=list[FriendOut])
def list_friends(
    status_filter: str | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's friends and pending requests.

    Optional query parameter ``status_filter``:
        - ``accepted`` -> only confirmed friends
        - ``pending``  -> only pending requests (incoming or outgoing)
        - omitted      -> all
    """
    me_id = current_user.id
    q = db.query(Friendship).filter(
        or_(Friendship.requester_id == me_id, Friendship.addressee_id == me_id)
    )
    if status_filter:
        q = q.filter(Friendship.status == status_filter)
    rows = q.order_by(Friendship.created_at.desc()).all()

    # Bulk-fetch other users for display
    other_ids = {
        r.addressee_id if r.requester_id == me_id else r.requester_id for r in rows
    }
    users = {
        u.id: u
        for u in db.query(UserGlobal).filter(UserGlobal.id.in_(other_ids)).all()
    } if other_ids else {}

    return [_to_out(r, me_id, users.get(_other_id(r, me_id))) for r in rows]


def _other_id(row: Friendship, me_id: int) -> int:
    return row.addressee_id if row.requester_id == me_id else row.requester_id


@router.post("/request", response_model=FriendOut, status_code=status.HTTP_201_CREATED)
def send_friend_request(
    body: FriendRequestIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a friend request to another user."""
    me_id = current_user.id
    if body.addressee_id == me_id:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")

    addressee = db.query(UserGlobal).filter(UserGlobal.id == body.addressee_id).first()
    if not addressee:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing relationship in either direction
    existing = (
        db.query(Friendship)
        .filter(
            or_(
                and_(Friendship.requester_id == me_id, Friendship.addressee_id == body.addressee_id),
                and_(Friendship.requester_id == body.addressee_id, Friendship.addressee_id == me_id),
            )
        )
        .first()
    )
    if existing:
        if existing.status == "blocked":
            raise HTTPException(status_code=403, detail="Cannot friend this user")
        if existing.status == "accepted":
            raise HTTPException(status_code=409, detail="Already friends")
        if existing.status == "pending":
            raise HTTPException(status_code=409, detail="Request already pending")

    fr = Friendship(
        requester_id=me_id,
        addressee_id=body.addressee_id,
        status="pending",
    )
    db.add(fr)
    db.commit()
    db.refresh(fr)
    return _to_out(fr, me_id, addressee)


@router.post("/accept/{friendship_id}", response_model=FriendOut)
def accept_friend_request(
    friendship_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an incoming friend request."""
    me_id = current_user.id
    fr = db.query(Friendship).filter(Friendship.id == friendship_id).first()
    if not fr:
        raise HTTPException(status_code=404, detail="Request not found")
    if fr.addressee_id != me_id:
        raise HTTPException(status_code=403, detail="Not your request to accept")
    if fr.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is {fr.status}")

    fr.status = "accepted"
    fr.accepted_at = datetime.utcnow()
    db.commit()
    db.refresh(fr)

    other = db.query(UserGlobal).filter(UserGlobal.id == fr.requester_id).first()
    return _to_out(fr, me_id, other)


@router.post("/decline/{friendship_id}", response_model=FriendOut)
def decline_friend_request(
    friendship_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    fr = db.query(Friendship).filter(Friendship.id == friendship_id).first()
    if not fr:
        raise HTTPException(status_code=404, detail="Request not found")
    if fr.addressee_id != me_id:
        raise HTTPException(status_code=403, detail="Not your request")
    if fr.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is {fr.status}")
    fr.status = "declined"
    db.commit()
    db.refresh(fr)
    other = db.query(UserGlobal).filter(UserGlobal.id == fr.requester_id).first()
    return _to_out(fr, me_id, other)


@router.delete("/{friendship_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friendship_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unfriend or cancel an outgoing request."""
    me_id = current_user.id
    fr = db.query(Friendship).filter(Friendship.id == friendship_id).first()
    if not fr:
        raise HTTPException(status_code=404, detail="Friendship not found")
    if me_id not in (fr.requester_id, fr.addressee_id):
        raise HTTPException(status_code=403, detail="Not your friendship")
    db.delete(fr)
    db.commit()
    return None


@router.get("/search", response_model=list[FriendOut])
def search_users(
    q: str,
    limit: int = 20,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search users by name/email substring (case-insensitive)."""
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 chars")
    me_id = current_user.id
    pattern = f"%{q.strip().lower()}%"
    users = (
        db.query(UserGlobal)
        .filter(
            or_(
                UserGlobal.name.ilike(pattern),
                UserGlobal.email.ilike(pattern),
            )
        )
        .filter(UserGlobal.id != me_id)
        .limit(min(limit, 50))
        .all()
    )

    # For each user, determine relationship status
    user_ids = [u.id for u in users]
    existing_rows = (
        db.query(Friendship)
        .filter(
            or_(
                and_(Friendship.requester_id == me_id, Friendship.addressee_id.in_(user_ids)),
                and_(Friendship.addressee_id == me_id, Friendship.requester_id.in_(user_ids)),
            )
        )
        .all()
    )
    by_other = {_other_id(r, me_id): r for r in existing_rows}

    out: list[FriendOut] = []
    for u in users:
        if u.id in by_other:
            out.append(_to_out(by_other[u.id], me_id, u))
        else:
            # Synthetic row: not yet related
            out.append(FriendOut(
                id=0,
                user_id=u.id,
                user_name=u.name,
                user_email=u.email,
                status="none",
                direction="outgoing",
                created_at=datetime.utcnow(),
                accepted_at=None,
            ))
    return out
