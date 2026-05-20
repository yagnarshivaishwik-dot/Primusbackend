import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import authenticate_user, get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db, get_global_db
from app.models import Game as GameModel
from app.models import License, User, UserCafeMap
from app.schemas import Game as GameSchema
from app.schemas import GameCreate, GameUpdate
from app.utils.cache import get_or_set, publish_invalidation

router = APIRouter()
logger = logging.getLogger(__name__)


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


@router.get("/popular", response_model=list[GameSchema])
async def list_popular_games(
    limit: int = Query(10, ge=1, le=100),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Return up to `limit` enabled games for the kiosk home page hero/rows (cached).

    The `Game` model does not currently have an explicit popularity column, so
    we simply surface enabled games ordered by id. When a play-count / featured
    flag is added to the model this query can be refined.
    """

    cache_id = f"limit={limit}"

    async def _compute() -> list[GameSchema]:
        def _query():
            return (
                scoped_query(db, GameModel, ctx)
                .filter(GameModel.enabled.is_(True))
                .order_by(GameModel.id.asc())
                .limit(limit)
                .all()
            )

        return await run_in_threadpool(_query)

    return await get_or_set(
        "game_popular",
        cache_id,
        "game_catalog",
        _compute,
        ttl=600,
        version="v1",
        stampede_key=cache_id,
    )


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


# ---------- Admin-supervised bulk add of locally-detected games ----------

class DetectedGameIn(BaseModel):
    """Minimal shape the kiosk's `detect_installed_games` bridge emits."""
    name: str
    exe_path: str | None = None
    category: str = "game"
    launcher: str | None = None


class AdminCreateDetectedIn(BaseModel):
    admin_email: str
    admin_password: str
    games: list[DetectedGameIn]


@router.post("/admin-create-detected")
async def admin_create_detected(
    body: AdminCreateDetectedIn,
    request: Request,
    cafe_db: Session = Depends(get_db),
    global_db: Session = Depends(get_global_db),
):
    """Bulk-create catalog entries for games the kiosk just scanned off the PC.

    Designed for the kiosk's "Add games from this PC" flow:
      1. React calls the C# bridge `detect_installed_games`, which scans
         Steam/Epic/etc on the local machine and returns name + exe_path
         + category per detected entry.
      2. The customer can't add these alone — the kiosk pops a modal
         asking the cafe admin to enter their credentials.
      3. This endpoint validates the admin (role + cafe ownership) and
         inserts a Game row per detected entry, skipping duplicates by
         name. Games are created as `enabled=True` because the admin's
         credentials are the approval.

    The admin's session is NOT switched — this is a one-shot
    authorisation tied to the form submission, the customer's JWT keeps
    driving everything else on the kiosk. Same pattern as
    `/auth/admin-bind-and-login`.
    """
    admin_email = (body.admin_email or "").strip()
    admin_password = body.admin_password or ""

    if not admin_email or not admin_password:
        raise HTTPException(400, "Admin email and password are required")
    if not body.games:
        raise HTTPException(400, "No games provided to add")

    # Step 1: validate admin against the GLOBAL DB (users table lives
    # there, not on per-cafe DBs — same pattern as /auth/admin-bind-and-login).
    admin = authenticate_user(global_db, admin_email, admin_password)
    if not admin:
        raise HTTPException(401, "Invalid admin credentials")
    if admin.role not in ("admin", "superadmin"):
        raise HTTPException(403, f"'{admin.role}' is not an admin role")

    # Step 2: resolve kiosk's cafe from X-License-Key + verify admin
    # owns it. License + UserCafeMap also live on the global DB.
    license_key_header = request.headers.get("X-License-Key")
    if not license_key_header:
        raise HTTPException(400, "Missing X-License-Key header — kiosk context required")
    lic = global_db.query(License).filter_by(key=license_key_header, is_active=True).first()
    if not lic or not lic.cafe_id:
        raise HTTPException(400, "Invalid or unknown kiosk license")
    kiosk_cafe_id = lic.cafe_id

    if admin.role != "superadmin":
        admin_mapping = (
            global_db.query(UserCafeMap)
            .filter_by(user_id=admin.id, cafe_id=kiosk_cafe_id)
            .first()
        )
        if not admin_mapping and admin.cafe_id != kiosk_cafe_id:
            raise HTTPException(
                403,
                "This admin doesn't own the cafe this kiosk is bound to",
            )

    # Step 3: bulk-insert games into the CAFE DB, skipping duplicates by name.
    # Game rows live on per-cafe DBs (the DB router resolves cafe_db from
    # X-License-Key automatically). admin/license/UserCafeMap above were
    # validated against the global DB; from here on we work on cafe_db.
    #
    # Dedup query: in MULTI_DB mode, cafe_db is already cafe-scoped AND
    # the games table has no cafe_id column — every row is for this cafe.
    # In single-DB mode the games table has a cafe_id column we must
    # filter on explicitly.
    try:
        from app.db.dependencies import MULTI_DB_ENABLED
    except Exception:
        MULTI_DB_ENABLED = True

    def _insert_all():
        q = cafe_db.query(GameModel.name)
        if not MULTI_DB_ENABLED:
            q = q.filter(GameModel.cafe_id == kiosk_cafe_id)
        existing_names = {n for (n,) in q.all()}
        created, skipped = [], []
        for g in body.games:
            if g.name in existing_names:
                skipped.append(g.name)
                continue
            kwargs = dict(
                name=g.name,
                exe_path=g.exe_path,
                category=g.category or "game",
                enabled=True,           # admin authorised → live immediately
                last_updated=datetime.now(UTC),
            )
            if g.launcher:
                kwargs["launchers"] = g.launcher
            # Single-DB only: tag the row with cafe_id explicitly so
            # tenant-scoping filters elsewhere still work. Multi-DB has
            # no cafe_id column.
            if not MULTI_DB_ENABLED:
                kwargs["cafe_id"] = kiosk_cafe_id
            cafe_db.add(GameModel(**kwargs))
            created.append(g.name)
            existing_names.add(g.name)
        cafe_db.commit()
        try:
            log_action(
                cafe_db,
                admin.id,
                "games_admin_bulk_added",
                f"Admin {admin_email} added {len(created)} detected games, "
                f"skipped {len(skipped)} (already in catalog).",
            )
        except Exception as exc:
            # Audit log on the cafe DB is best-effort — don't fail the
            # whole add if the audit table shape differs from expectations.
            logger.warning("admin-create-detected: log_action failed: %s", exc)
        return created, skipped

    created, skipped = await run_in_threadpool(_insert_all)

    await publish_invalidation(
        {
            "scope": "games",
            "items": [
                {"type": "game_catalog", "id": "*"},
                {"type": "game_count", "id": "*"},
            ],
        }
    )

    logger.info(
        "[GAMES ADMIN-CREATE] admin=%s cafe=%s created=%d skipped=%d",
        admin.id, kiosk_cafe_id, len(created), len(skipped),
    )

    return {
        "created": created,
        "skipped": skipped,
        "cafe_id": kiosk_cafe_id,
    }


