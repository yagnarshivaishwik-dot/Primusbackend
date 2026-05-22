"""
Per-cafe database engine and session factory.

Each cafe gets its own PostgreSQL database named primus_cafe_{cafe_id}.
This module provides the CafeBase declarative base for cafe-scoped models.
Engine creation and caching is handled by the CafeDBRouter.

Design note (intentional, see also models_cafe.py module docstring):
the cafe-scoped tables have NO `cafe_id` column. The database itself
IS the cafe boundary — whichever cafe DB you connected to *is* the
cafe identity. There is no second source of truth at the row level.

The `_CafeModelBase` mixin below makes this design ergonomic for
endpoint code: every cafe-scoped model silently accepts and discards
the legacy `cafe_id=ctx.cafe_id` kwarg (a habit from the pre-multi-DB
era), and exposes `instance.cafe_id` as a benign `None` instead of
AttributeError'ing on read. The legitimate cafe identity is always
available via the AuthContext (`ctx.cafe_id`) or the session's bind
URL — those remain the canonical source.
"""

from sqlalchemy.orm import declarative_base


class _CafeModelBase:
    """Behavioural mixin attached to every cafe-scoped model via the
    `declarative_base(cls=...)` factory below.

    Problem this fixes:
    Many endpoints (especially older ones inherited from the single-DB
    era) construct cafe-scoped rows with
        Model(cafe_id=ctx.cafe_id, ...)
    out of habit, because in the legacy schema every table had a
    `cafe_id` FK. In multi-DB mode those models have NO `cafe_id`
    column (by design — see the module docstring above), and
    SQLAlchemy's declarative `__init__` raises
        'cafe_id' is an invalid keyword argument for <Model>
    at INSERT time. The endpoint 500s, the customer flow breaks.

    How the one-line fix works:
    SQLAlchemy's declarative `__init__` validates each kwarg with
    `hasattr(cls, k)` — if the class exposes an attribute by that name
    (any kind, including a plain Python class attribute), the kwarg is
    accepted and stored via `setattr(instance, k, value)`.

    Declaring `cafe_id = None` here means every cafe-scoped model
    `hasattr`s cafe_id. SQLAlchemy stops raising. The passed-in value
    is stored as a regular Python instance attribute (not a DB column —
    there's no column to persist to). Reads of `instance.cafe_id` work
    in three states:
      - kwarg was passed → returns that value (instance attr)
      - kwarg wasn't passed → returns None (class attr fallback)
      - instance was refetched from DB → returns None (no persisted column)

    What this is NOT: a path to storing a cafe_id at the row level.
    There is genuinely no column. The canonical cafe identity is
    always `ctx.cafe_id` from the AuthContext (set by the JWT /
    X-License-Key auth chain) and the session bind URL.

    Why no `__init__` override:
    An earlier draft of this mixin also overrode `__init__` to pop the
    kwarg from kwargs before calling super(). A runtime trace confirmed
    SQLAlchemy's declarative metaclass bypasses inherited `__init__`
    methods on the cls — only the class attribute (above) matters.
    Removing the __init__ avoided dead code that suggested the wrong
    mental model.
    """

    cafe_id = None


CafeBase = declarative_base(cls=_CafeModelBase)
