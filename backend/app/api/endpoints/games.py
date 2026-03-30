from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.database import get_db
from app.models import Game as GameModel
from app.models import User
from app.schemas import Game as GameSchema
from app.schemas import GameCreate, GameUpdate
from app.utils.cache import get_or_set, publish_invalidation

router = APIRouter()


@router.get("", response_model=list[GameSchema])
async def list_games(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    search: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """List games with optional filtering and pagination (cached)."""

    cache_id = (
        f"skip={skip}|limit={limit}|search={search or ''}|"
        f"category={category or ''}|enabled={'' if enabled is None else str(enabled)}"
    )

    async def _compute() -> list[GameSchema]:
        def _query():
            query = scoped_query(db, GameModel, ctx)
            if search:
                query = query.filter(GameModel.name.ilike(f"%{search}%"))
            if category:
                query = query.filter(GameModel.category == category)
            if enabled is not None:
                query = query.filter(GameModel.enabled == enabled)
            return query.offset(skip).limit(limit).all()

        return await run_in_threadpool(_query)

    # Game catalog cache: 5–10 minutes TTL (use 10 minutes)
    return await get_or_set(
        "game_catalog",
        cache_id,
        "game_catalog",
        _compute,
        ttl=600,
        version="v1",
        stampede_key=cache_id,
    )


@router.get("/count")
async def get_games_count(
    search: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Get total count of games with optional filtering (cached)."""

    cache_id = (
        f"search={search or ''}|category={category or ''}|"
        f"enabled={'' if enabled is None else str(enabled)}"
    )

    async def _compute() -> int:
        def _query() -> int:
            query = scoped_query(db, GameModel, ctx)
            if search:
                query = query.filter(GameModel.name.ilike(f"%{search}%"))
            if category:
                query = query.filter(GameModel.category == category)
            if enabled is not None:
                query = query.filter(GameModel.enabled == enabled)
            return query.count()

        return await run_in_threadpool(_query)

    count = await get_or_set(
        "game_count",
        cache_id,
        "game_catalog",
        _compute,
        ttl=600,
        version="v1",
        stampede_key=cache_id,
    )
    return {"count": count}


@router.post("", response_model=GameSchema)
async def create_game(
    game: GameCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Create a new game and invalidate cached catalogs."""

    def _create() -> GameModel:
        existing = db.query(GameModel).filter(GameModel.name == game.name).first()
        if existing:
            raise HTTPException(
                status_code=400, detail=f"Game with name '{game.name}' already exists"
            )
        db_game = GameModel(**game.dict(), cafe_id=ctx.cafe_id)
        db.add(db_game)
        db.commit()
        db.refresh(db_game)
        log_action(db, current_user.id, "game_created", f"Created game: {game.name}")
        return db_game

    db_game = await run_in_threadpool(_create)

    await publish_invalidation(
        {
            "scope": "games",
            "items": [
                {"type": "game_catalog", "id": "*"},
                {"type": "game_count", "id": "*"},
            ],
        }
    )

    return db_game


@router.put("/{game_id}", response_model=GameSchema)
async def update_game(
    game_id: int,
    game_update: GameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Update an existing game and invalidate cached catalogs."""

    def _update() -> GameModel:
        db_game = db.query(GameModel).filter(GameModel.id == game_id).first()
        if not db_game:
            raise HTTPException(status_code=404, detail="Game not found")
        enforce_cafe_ownership(db_game, ctx)

        update_data = game_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_game, field, value)

        db_game.last_updated = datetime.now(UTC)
        db.commit()
        db.refresh(db_game)

        log_action(db, current_user.id, "game_updated", f"Updated game: {db_game.name}")
        return db_game

    db_game = await run_in_threadpool(_update)

    await publish_invalidation(
        {
            "scope": "games",
            "items": [
                {"type": "game_catalog", "id": "*"},
                {"type": "game_count", "id": "*"},
            ],
        }
    )

    return db_game


@router.delete("/{game_id}")
async def delete_game(
    game_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Delete a game and invalidate cached catalogs."""

    def _delete() -> str:
        db_game = db.query(GameModel).filter(GameModel.id == game_id).first()
        if not db_game:
            raise HTTPException(status_code=404, detail="Game not found")
        enforce_cafe_ownership(db_game, ctx)

        game_name = db_game.name
        db.delete(db_game)
        db.commit()

        log_action(db, current_user.id, "game_deleted", f"Deleted game: {game_name}")
        return game_name

    game_name = await run_in_threadpool(_delete)

    await publish_invalidation(
        {
            "scope": "games",
            "items": [
                {"type": "game_catalog", "id": "*"},
                {"type": "game_count", "id": "*"},
            ],
        }
    )

    return {"message": f"Game '{game_name}' deleted successfully"}


@router.post("/bulk-toggle")
async def bulk_toggle_games(
    game_ids: list[int],
    enabled: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """Bulk toggle games enabled/disabled status and invalidate cached catalogs."""

    def _toggle() -> int:
        games = scoped_query(db, GameModel, ctx).filter(GameModel.id.in_(game_ids)).all()
        for game in games:
            game.enabled = enabled
            game.last_updated = datetime.now(UTC)
        db.commit()

        log_action(
            db,
            current_user.id,
            "games_bulk_toggled",
            f"Bulk {'enabled' if enabled else 'disabled'} {len(games)} games",
        )
        return len(games)

    affected = await run_in_threadpool(_toggle)

    await publish_invalidation(
        {
            "scope": "games",
            "items": [
                {"type": "game_catalog", "id": "*"},
                {"type": "game_count", "id": "*"},
            ],
        }
    )

    return {"message": f"{affected} games {'enabled' if enabled else 'disabled'} successfully"}
