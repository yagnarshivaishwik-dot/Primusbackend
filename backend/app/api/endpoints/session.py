from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user, require_role
from app.api.endpoints.billing import calculate_billing
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db
from app.schemas import SessionOut, SessionStart
from app.utils.cache import get_or_set, publish_invalidation

if MULTI_DB_ENABLED:
    from app.db.models_cafe import Session as PCSession, ClientPC  # type: ignore[assignment]
else:
    from app.models import Session as PCSession, ClientPC  # type: ignore[assignment]

router = APIRouter()


@router.post("/start", response_model=SessionOut)
async def start_session(
    data: SessionStart,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    def _create() -> PCSession:
        # Multi-DB translation. The kiosk passes the customer's GLOBAL
        # user id (the same one in the JWT sub). PCSession.user_id and
        # ClientPC.current_user_id both FK to the cafe-local users.id
        # (CafeUser.id), NOT the global id. Without this translation
        # the INSERT trips a ForeignKeyViolation — silently swallowed
        # by the kiosk's try/catch around the /session/start call, with
        # the visible symptom being "no PCSession ever appears, paywall
        # decrementer has nothing to run against, timer never ticks".
        #
        # Same translation pattern as payment_cash: provision the
        # CafeUser if missing, then look up its id.
        user_fk = data.user_id  # single-DB / fallback
        if MULTI_DB_ENABLED:
            from app.db.models_cafe import CafeUser
            from app.services.cafe_user_provisioning import ensure_cafe_user
            try:
                ensure_cafe_user(
                    global_user_id=data.user_id,
                    cafe_id=ctx.cafe_id,
                )
            except Exception:
                # ensure_cafe_user logs its own warnings; the lookup
                # below will catch a genuinely-missing mirror.
                pass
            cafe_user = (
                db.query(CafeUser)
                .filter(CafeUser.global_user_id == data.user_id)
                .first()
            )
            if cafe_user is None:
                # Session refresh sometimes lets ensure_cafe_user's INSERT
                # land in a different transaction context; expire + re-fetch.
                db.expire_all()
                cafe_user = (
                    db.query(CafeUser)
                    .filter(CafeUser.global_user_id == data.user_id)
                    .first()
                )
            if cafe_user is None:
                raise HTTPException(
                    status_code=500,
                    detail="Could not provision customer in cafe DB",
                )
            user_fk = cafe_user.id

        now = datetime.now(UTC)
        session = PCSession(
            pc_id=data.pc_id,
            user_id=user_fk,
            cafe_id=ctx.cafe_id,
            start_time=now,
            # Phase 2 paywall — anchor the per-minute decrementer at
            # session start. paywall_tick.debit_session advances this
            # by debit_minutes*60s on every heartbeat.
            last_tick_at=now,
            paid=False,
            amount=0.0,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        try:
            log_action(db, data.user_id, "session_start", f"PC:{data.pc_id}", None)
        except Exception:
            pass
        try:
            pc = db.query(ClientPC).filter_by(id=data.pc_id).first()
            if pc:
                # current_user_id FKs to cafe-local users.id, same
                # translation as above.
                pc.current_user_id = user_fk
                db.commit()
        except Exception:
            pass
        return session

    session = await run_in_threadpool(_create)

    await publish_invalidation(
        {
            "scope": "sessions",
            "items": [
                {"type": "session_active_guests", "id": "all"},
            ],
        }
    )

    return session


@router.post("/stop/{session_id}", response_model=SessionOut)
async def stop_session(
    session_id: int,
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    def _stop() -> PCSession:
        session = db.query(PCSession).filter_by(id=session_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        enforce_cafe_ownership(session, ctx)
        if session.end_time:
            return session
        session.end_time = datetime.now(UTC)
        db.commit()
        db.refresh(session)
        try:
            log_action(db, session.user_id, "session_stop", f"PC:{session.pc_id} duration", None)
        except Exception:
            pass
        try:
            _ = calculate_billing(session, db)
        except HTTPException:
            pass
        try:
            pc = db.query(ClientPC).filter_by(id=session.pc_id).first()
            if pc:
                pc.current_user_id = None
                db.commit()
        except Exception:
            pass
        return session

    session = await run_in_threadpool(_stop)

    await publish_invalidation(
        {
            "scope": "sessions",
            "items": [
                {"type": "session_active_guests", "id": "all"},
            ],
        }
    )

    return session


@router.get(
    "/current",
    response_model=SessionOut | None,
    summary="Get current active session for the authenticated user (if any)",
)
async def current_session(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Return the latest active (not yet stopped) session for the current user, if it exists.
    """

    def _query() -> PCSession | None:
        return (
            db.query(PCSession)
            .filter(PCSession.user_id == current_user.id, PCSession.end_time.is_(None))
            .order_by(PCSession.start_time.desc())
            .first()
        )

    session = await run_in_threadpool(_query)
    return session


@router.get(
    "/history",
    response_model=list[SessionOut],
    summary="List session history for the current or specified user",
)
async def session_history(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Return past sessions for a user. If `user_id` is not provided,
    history for the authenticated user is returned.
    """

    effective_user_id = user_id or current_user.id

    async def _compute() -> list[PCSession]:
        def _query():
            return (
                scoped_query(db, PCSession, ctx)
                .filter(PCSession.user_id == effective_user_id)
                .order_by(PCSession.start_time.desc())
                .all()
            )

        return await run_in_threadpool(_query)

    return await _compute()


# Admin: list active guest sessions
@router.get("/guests", response_model=list[SessionOut])
async def list_guests(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    async def _compute() -> list[SessionOut]:
        def _query():
            return (
                scoped_query(db, PCSession, ctx)
                .filter(PCSession.end_time.is_(None))
                .order_by(PCSession.start_time.desc())
                .all()
            )

        return await run_in_threadpool(_query)

    # Frequently-read active session lookup: cache for 15 seconds
    return await get_or_set(
        "session_active_guests",
        "all",
        "sessions",
        _compute,
        ttl=15,
        version="v1",
        stampede_key="session_active_guests_all",
    )
