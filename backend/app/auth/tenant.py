"""Tenant scoping utilities for multi-cafe isolation."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session
from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.auth.context import AuthContext


def scoped_query(db: Session, model, ctx: AuthContext) -> Query:
    """Return a query pre-filtered by the user's cafe_id.

    Superadmin gets unfiltered access to all cafes.
    All other roles are restricted to their own cafe.

    Two model families flow through here:

      * **Legacy / global-DB models** (``app.models.*``) where ``cafe_id``
        is a real mapped Column on the row. We filter by that column.

      * **Cafe-scoped models** (``app.db.models_cafe.*``) where the cafe DB
        itself IS the cafe boundary — there is no ``cafe_id`` column. The
        ``_CafeModelBase`` mixin (added in commit 1e685ab on 2026-05-21
        per TECH_DEBT #23) gives every such class a ``cafe_id = None``
        Python attribute so endpoint code's habitual
        ``Model(cafe_id=ctx.cafe_id, ...)`` constructor calls don't 500.
        For those models, the right filter is NO filter — the DB session
        is already cafe-scoped via ``cafe_db_router.get_session(cafe_id)``.

    The bug we used to have: this function checked ``hasattr(model,
    'cafe_id')``. After the mixin landed, that returned ``True`` for
    BOTH families — and for the cafe-scoped family, the subsequent
    ``model.cafe_id == ctx.cafe_id`` filter resolved to ``None ==
    <int>`` which SQLAlchemy compiles to ``WHERE NULL``, returning zero
    rows. Every cafe-scoped endpoint that goes through scoped_query
    (chat, games, prize, event, session, wallet, offer, …) silently
    returned empty lists in production for ~four days before being
    spotted via the kiosk chat / apps regression on 2026-05-25.

    Fix: check that ``model.cafe_id`` is an ``InstrumentedAttribute``
    (SQLAlchemy's wrapper around a mapped Column) rather than just any
    attribute. The mixin's plain Python ``None`` fails that check and
    we skip the filter — correct behaviour, since each cafe DB already
    provides physical tenant isolation.

    Args:
        db: SQLAlchemy session (already cafe-bound in multi-DB mode).
        model: SQLAlchemy model class.
        ctx: Authenticated request context.

    Returns:
        SQLAlchemy Query, filtered by ``model.cafe_id`` only when the
        model actually has a mapped ``cafe_id`` column.
    """
    query = db.query(model)

    if ctx.is_superadmin:
        return query

    if ctx.cafe_id is None:
        raise HTTPException(
            status_code=403,
            detail="No cafe context available. Cannot access tenant-scoped data.",
        )

    cafe_id_attr = getattr(model, "cafe_id", None)
    if not isinstance(cafe_id_attr, InstrumentedAttribute):
        # Cafe-scoped model (mixin's None) or anything else without a
        # real mapped column. Physical cafe-DB routing already scopes
        # the rows; no SQL filter needed.
        return query

    return query.filter(cafe_id_attr == ctx.cafe_id)


def enforce_cafe_ownership(obj, ctx: AuthContext) -> None:
    """Raise 403 if the object doesn't belong to the user's cafe.

    Superadmin bypasses this check. Use for single-object operations
    (get by id, update, delete) after fetching from DB.

    Args:
        obj: SQLAlchemy model instance (must have cafe_id attribute)
        ctx: Authenticated request context

    Raises:
        HTTPException 403 if cafe_id mismatch
        HTTPException 404 if object is None
    """
    if obj is None:
        raise HTTPException(status_code=404, detail="Resource not found")

    if ctx.is_superadmin:
        return

    obj_cafe_id = getattr(obj, "cafe_id", None)
    if obj_cafe_id is not None and obj_cafe_id != ctx.cafe_id:
        raise HTTPException(status_code=403, detail="Access denied: resource belongs to another cafe")
