from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user
from app.database import get_db
from app.models import Game as GameModel
from app.models import User
from app.schemas import Game as GameSchema
from app.schemas import GameCreate, GameUpdate

router = APIRouter()


@router.get("", response_model=list[GameSchema])
def list_games(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
    db: Session = Depends(get_db),
):
    """List games with optional filtering and pagination"""
    query = db.query(GameModel)

    if search:
        query = query.filter(GameModel.name.ilike(f"%{search}%"))

    if category:
        query = query.filter(GameModel.category == category)

    if enabled is not None:
        query = query.filter(GameModel.enabled == enabled)

    games = query.offset(skip).limit(limit).all()
    return games


@router.get("/count")
def get_games_count(
    search: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
    db: Session = Depends(get_db),
):
    """Get total count of games with optional filtering"""
    query = db.query(GameModel)

    if search:
        query = query.filter(GameModel.name.ilike(f"%{search}%"))

    if category:
        query = query.filter(GameModel.category == category)

    if enabled is not None:
        query = query.filter(GameModel.enabled == enabled)

    count = query.count()
    return {"count": count}


@router.post("", response_model=GameSchema)
def create_game(
    game: GameCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Create a new game"""
    # Check if game with same name already exists
    existing = db.query(GameModel).filter(GameModel.name == game.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Game with name '{game.name}' already exists")

    db_game = GameModel(**game.dict())
    db.add(db_game)
    db.commit()
    db.refresh(db_game)

    # Log the action
    log_action(db, current_user.id, "game_created", f"Created game: {game.name}")

    return db_game


@router.put("/{game_id}", response_model=GameSchema)
def update_game(
    game_id: int,
    game_update: GameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing game"""
    db_game = db.query(GameModel).filter(GameModel.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Update only provided fields
    update_data = game_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_game, field, value)

    db_game.last_updated = datetime.now(UTC)
    db.commit()
    db.refresh(db_game)

    # Log the action
    log_action(db, current_user.id, "game_updated", f"Updated game: {db_game.name}")

    return db_game


@router.delete("/{game_id}")
def delete_game(
    game_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a game"""
    db_game = db.query(GameModel).filter(GameModel.id == game_id).first()
    if not db_game:
        raise HTTPException(status_code=404, detail="Game not found")

    game_name = db_game.name
    db.delete(db_game)
    db.commit()

    # Log the action
    log_action(db, current_user.id, "game_deleted", f"Deleted game: {game_name}")

    return {"message": f"Game '{game_name}' deleted successfully"}


@router.post("/bulk-toggle")
def bulk_toggle_games(
    game_ids: list[int],
    enabled: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk toggle games enabled/disabled status"""
    games = db.query(GameModel).filter(GameModel.id.in_(game_ids)).all()

    for game in games:
        game.enabled = enabled
        game.last_updated = datetime.now(UTC)

    db.commit()

    # Log the action
    log_action(
        db,
        current_user.id,
        "games_bulk_toggled",
        f"Bulk {'enabled' if enabled else 'disabled'} {len(games)} games",
    )

    return {"message": f"{len(games)} games {'enabled' if enabled else 'disabled'} successfully"}
