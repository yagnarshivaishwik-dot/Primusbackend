"""
Cursor-based pagination for list endpoints.

Usage in endpoints:
    from app.api.pagination import CursorPage, paginate

    @router.get("/items")
    def list_items(page: CursorPage = Depends(), db: Session = Depends(get_db)):
        return paginate(
            db.query(Item).filter(...),
            page,
            Item.id,
        )

Response format:
    {
        "items": [...],
        "next_cursor": "123" | null,
        "has_more": true | false
    }
"""

from typing import Any

from fastapi import Query
from sqlalchemy.orm import Query as SAQuery


class CursorPage:
    """
    Dependency-injectable pagination parameters.

    Query params:
        cursor: opaque cursor (the ID of the last item seen)
        limit: max items to return (1-100, default 20)
    """

    def __init__(
        self,
        cursor: str | None = Query(None, description="Cursor from previous response"),
        limit: int = Query(20, ge=1, le=100, description="Max items per page"),
    ):
        self.cursor = cursor
        self.limit = limit


def paginate(query: SAQuery, page: CursorPage, id_column: Any) -> dict:
    """
    Apply cursor-based pagination to a SQLAlchemy query.

    Args:
        query: SQLAlchemy query (pre-filtered, pre-ordered is optional)
        page: CursorPage params from the request
        id_column: The model's ID column to use as cursor (e.g., Model.id)

    Returns:
        dict with "items", "next_cursor", "has_more"
    """
    if page.cursor is not None:
        try:
            cursor_val = int(page.cursor)
            query = query.filter(id_column > cursor_val)
        except (ValueError, TypeError):
            pass  # ignore invalid cursor — return from the beginning

    # Fetch one extra to detect if there are more
    items = query.order_by(id_column).limit(page.limit + 1).all()

    has_more = len(items) > page.limit
    items = items[: page.limit]

    next_cursor = None
    if has_more and items:
        last = items[-1]
        # Support both .id attribute and column-mapped objects
        next_cursor = str(getattr(last, "id", None) or getattr(last, id_column.key, None))

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more,
    }
