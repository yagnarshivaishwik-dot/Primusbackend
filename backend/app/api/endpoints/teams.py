"""Team management endpoints for the mobile app."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.db.dependencies import get_global_db as get_db
from app.db.models_global import Team, TeamMember, UserGlobal
from app.schemas.social import (
    TeamCreateIn,
    TeamInviteIn,
    TeamMemberOut,
    TeamOut,
)

router = APIRouter()


def _team_to_out(team: Team, members: list[TeamMember], users: dict[int, UserGlobal]) -> TeamOut:
    return TeamOut(
        id=team.id,
        name=team.name,
        tag=team.tag,
        owner_id=team.owner_id,
        avatar_url=team.avatar_url,
        created_at=team.created_at,
        members=[
            TeamMemberOut(
                user_id=m.user_id,
                user_name=getattr(users.get(m.user_id), "name", None),
                role=m.role,
                joined_at=m.joined_at,
            )
            for m in members
        ],
    )


@router.get("/", response_model=list[TeamOut])
def list_my_teams(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List teams where the user is owner or member."""
    me_id = current_user.id
    member_rows = (
        db.query(TeamMember)
        .filter(TeamMember.user_id == me_id, TeamMember.role != "invited")
        .all()
    )
    team_ids = {r.team_id for r in member_rows}
    if not team_ids:
        return []

    teams = db.query(Team).filter(Team.id.in_(team_ids)).all()
    all_members = (
        db.query(TeamMember).filter(TeamMember.team_id.in_(team_ids)).all()
    )
    user_ids = {m.user_id for m in all_members}
    users = {
        u.id: u
        for u in db.query(UserGlobal).filter(UserGlobal.id.in_(user_ids)).all()
    }
    by_team: dict[int, list[TeamMember]] = {tid: [] for tid in team_ids}
    for m in all_members:
        by_team.setdefault(m.team_id, []).append(m)

    return [_team_to_out(t, by_team.get(t.id, []), users) for t in teams]


@router.post("/", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreateIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new team owned by the current user."""
    me_id = current_user.id
    team = Team(
        name=body.name,
        tag=body.tag,
        owner_id=me_id,
        avatar_url=body.avatar_url,
    )
    db.add(team)
    db.commit()
    db.refresh(team)

    member = TeamMember(
        team_id=team.id,
        user_id=me_id,
        role="owner",
        joined_at=datetime.utcnow(),
    )
    db.add(member)
    db.commit()

    me = db.query(UserGlobal).filter(UserGlobal.id == me_id).first()
    return _team_to_out(team, [member], {me_id: me} if me else {})


@router.get("/{team_id}", response_model=TeamOut)
def get_team(
    team_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    members = db.query(TeamMember).filter(TeamMember.team_id == team_id).all()
    if not any(m.user_id == me_id for m in members):
        raise HTTPException(status_code=403, detail="Not a member of this team")

    user_ids = {m.user_id for m in members}
    users = {
        u.id: u
        for u in db.query(UserGlobal).filter(UserGlobal.id.in_(user_ids)).all()
    }
    return _team_to_out(team, members, users)


@router.post("/{team_id}/invite", response_model=TeamMemberOut, status_code=status.HTTP_201_CREATED)
def invite_to_team(
    team_id: int,
    body: TeamInviteIn,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.owner_id != me_id:
        raise HTTPException(status_code=403, detail="Only the owner can invite")

    invitee = db.query(UserGlobal).filter(UserGlobal.id == body.user_id).first()
    if not invitee:
        raise HTTPException(status_code=404, detail="User not found")

    existing = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == body.user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"User already {existing.role}")

    member = TeamMember(team_id=team_id, user_id=body.user_id, role="invited")
    db.add(member)
    db.commit()
    db.refresh(member)

    return TeamMemberOut(
        user_id=member.user_id,
        user_name=invitee.name,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.post("/{team_id}/join", response_model=TeamMemberOut)
def accept_invite(
    team_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    member = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == me_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="No invite found")
    if member.role != "invited":
        raise HTTPException(status_code=400, detail=f"Already {member.role}")
    member.role = "member"
    member.joined_at = datetime.utcnow()
    db.commit()
    db.refresh(member)
    me = db.query(UserGlobal).filter(UserGlobal.id == me_id).first()
    return TeamMemberOut(
        user_id=member.user_id,
        user_name=getattr(me, "name", None),
        role=member.role,
        joined_at=member.joined_at,
    )


@router.delete("/{team_id}/member/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    team_id: int,
    user_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    # Owner can remove anyone except themselves; members can only remove themselves
    if me_id != team.owner_id and me_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if user_id == team.owner_id:
        raise HTTPException(status_code=400, detail="Owner cannot leave; delete team instead")

    member = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
    return None


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me_id = current_user.id
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.owner_id != me_id:
        raise HTTPException(status_code=403, detail="Only the owner can delete")
    # Cascade-delete members manually
    db.query(TeamMember).filter(TeamMember.team_id == team_id).delete()
    db.delete(team)
    db.commit()
    return None
