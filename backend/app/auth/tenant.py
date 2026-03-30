"""Tenant scoping utilities for multi-cafe isolation."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Query, Session

from app.auth.context import AuthContext


def scoped_query(db: Session, model, ctx: AuthContext) -> Query:
    """Return a query pre-filtered by the user's cafe_id.

    Superadmin gets unfiltered access to all cafes.
    All other roles are restricted to their own cafe.

    Args:
        db: SQLAlchemy session
        model: SQLAlchemy model class (must have cafe_id column)
        ctx: Authenticated request context

    Returns:
        SQLAlchemy Query filtered by cafe_id
    """
    query = db.query(model)

    if ctx.is_superadmin:
        return query

    if ctx.cafe_id is None:
        raise HTTPException(
            status_code=403,
            detail="No cafe context available. Cannot access tenant-scoped data.",
        )

    if not hasattr(model, "cafe_id"):
        return query

    return query.filter(model.cafe_id == ctx.cafe_id)


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
