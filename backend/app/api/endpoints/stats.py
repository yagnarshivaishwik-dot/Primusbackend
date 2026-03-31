from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query
from app.db.dependencies import get_cafe_db as get_db
from app.models import PC, Order, OrderItem, User, WalletTransaction
from app.models import Session as PCSession
from app.utils.cache import get_or_set

router = APIRouter()


def _range(period: str | None, custom_start: str | None, custom_end: str | None):
    now = datetime.utcnow()
    if period == "yesterday":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = end - timedelta(days=1)
        return start, end
    if period == "this_week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            days=now.weekday()
        )
        end = start + timedelta(days=7)
        return start, end
    if period == "this_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # naive next month
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        return start, end
    if custom_start and custom_end:
        try:
            from datetime import datetime as _dt

            return _dt.fromisoformat(custom_start), _dt.fromisoformat(custom_end)
        except Exception:
            pass
    # default today
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


# Summary stats (admin only) with period
@router.get("/summary")
async def stats_summary(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    start_dt, end_dt = _range(period, start, end)

    cache_id = (
        f"summary|period={period or ''}|start={start_dt.isoformat()}|end={end_dt.isoformat()}"
    )

    async def _compute() -> dict:
        def _query() -> dict:
            active_sessions = scoped_query(db, PCSession, ctx).filter(PCSession.end_time.is_(None)).count()
            todays_sessions = (
                scoped_query(db, PCSession, ctx)
                .filter(PCSession.start_time >= start_dt, PCSession.start_time < end_dt)
                .count()
            )
            revenue_today = (
                scoped_query(db, WalletTransaction, ctx)
                .with_entities(func.sum(WalletTransaction.amount))
                .filter(
                    WalletTransaction.timestamp >= start_dt,
                    WalletTransaction.timestamp < end_dt,
                    WalletTransaction.type == "deduct",
                )
                .scalar()
                or 0.0
            )
            order_total = (
                scoped_query(db, Order, ctx)
                .with_entities(func.sum(Order.total))
                .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
                .scalar()
                or 0.0
            )
            total_users = scoped_query(db, User, ctx).count()
            total_pcs = scoped_query(db, PC, ctx).count()
            return {
                "active_sessions": active_sessions,
                "todays_sessions": todays_sessions,
                "revenue": -revenue_today,
                "orders_total": order_total,
                "total_users": total_users,
                "total_pcs": total_pcs,
                "period": {"start": start_dt, "end": end_dt},
            }

        return await run_in_threadpool(_query)

    # Analytics summary: cache for 15 minutes
    return await get_or_set(
        "stats_summary",
        cache_id,
        "analytics",
        _compute,
        ttl=900,
        version="v1",
        stampede_key=cache_id,
    )


# Top users by spending
@router.get("/top-users")
async def top_users(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    cache_id = "top-users"

    async def _compute() -> list[dict]:
        def _query() -> list[dict]:
            q = db.query(User.name, func.sum(WalletTransaction.amount).label("spent")).join(
                WalletTransaction, WalletTransaction.user_id == User.id
            ).filter(WalletTransaction.type == "deduct")
            if not ctx.is_superadmin and ctx.cafe_id:
                q = q.filter(User.cafe_id == ctx.cafe_id)
            res = (
                q.group_by(User.name)
                .order_by(func.sum(WalletTransaction.amount))
                .limit(10)
                .all()
            )
            return [{"username": r.name, "spent": -r.spent} for r in res]

        return await run_in_threadpool(_query)

    # Analytics: cache for 30 minutes
    return await get_or_set(
        "stats_top_users",
        cache_id,
        "analytics",
        _compute,
        ttl=1800,
        version="v1",
        stampede_key=cache_id,
    )


# Peak hours (sessions started by hour of day)
@router.get("/peak-hours")
async def peak_hours(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    cache_id = "peak-hours"

    async def _compute() -> list[dict]:
        def _query() -> list[dict]:
            q = scoped_query(db, PCSession, ctx).with_entities(
                func.extract("hour", PCSession.start_time).label("hour"),
                func.count().label("count"),
            )
            res = q.group_by("hour").order_by("hour").all()
            return [{"hour": int(r.hour), "count": r.count} for r in res]

        return await run_in_threadpool(_query)

    # Analytics: cache for 30 minutes
    return await get_or_set(
        "stats_peak_hours",
        cache_id,
        "analytics",
        _compute,
        ttl=1800,
        version="v1",
        stampede_key=cache_id,
    )


# Sales series by hour for a given period
@router.get("/sales-series")
async def sales_series(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    start_dt, end_dt = _range(period, start, end)
    cache_id = (
        f"sales-series|period={period or ''}|start={start_dt.isoformat()}|end={end_dt.isoformat()}"
    )

    async def _compute() -> dict:
        def _query() -> dict:
            res = (
                scoped_query(db, WalletTransaction, ctx)
                .with_entities(
                    func.extract("hour", WalletTransaction.timestamp).label("hour"),
                    func.sum(WalletTransaction.amount).label("amt"),
                )
                .filter(
                    WalletTransaction.timestamp >= start_dt,
                    WalletTransaction.timestamp < end_dt,
                    WalletTransaction.type == "deduct",
                )
                .group_by("hour")
                .order_by("hour")
                .all()
            )
            out = [0] * 24
            for r in res:
                out[int(r.hour)] = float(-(r.amt or 0.0))
            return {"start": start_dt, "end": end_dt, "hours": list(range(24)), "values": out}

        return await run_in_threadpool(_query)

    # Analytics: cache for 30 minutes
    return await get_or_set(
        "stats_sales_series",
        cache_id,
        "analytics",
        _compute,
        ttl=1800,
        version="v1",
        stampede_key=cache_id,
    )


# Users series (new members by hour)
@router.get("/users-series")
async def users_series(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    start_dt, end_dt = _range(period, start, end)
    cache_id = (
        f"users-series|period={period or ''}|start={start_dt.isoformat()}|end={end_dt.isoformat()}"
    )

    async def _compute() -> dict:
        def _query() -> dict:
            res = (
                scoped_query(db, User, ctx)
                .with_entities(
                    func.extract("hour", User.created_at).label("hour"),
                    func.count().label("cnt"),
                )
                .filter(User.created_at >= start_dt, User.created_at < end_dt)
                .group_by("hour")
                .order_by("hour")
                .all()
            )
            out = [0] * 24
            for r in res:
                out[int(r.hour)] = int(r.cnt)
            return {"start": start_dt, "end": end_dt, "hours": list(range(24)), "values": out}

        return await run_in_threadpool(_query)

    # Analytics: cache for 30 minutes
    return await get_or_set(
        "stats_users_series",
        cache_id,
        "analytics",
        _compute,
        ttl=1800,
        version="v1",
        stampede_key=cache_id,
    )


# Sales table (gamepasses/guests)
@router.get("/sales-table")
async def sales_table(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    start_dt, end_dt = _range(period, start, end)
    cache_id = (
        f"sales-table|period={period or ''}|start={start_dt.isoformat()}|end={end_dt.isoformat()}"
    )

    async def _compute() -> list[dict]:
        def _query() -> list[dict]:
            from app.models import Product

            q = (
                db.query(
                    Product.name,
                    func.count(OrderItem.id).label("qty"),
                    func.sum(OrderItem.price).label("revenue"),
                )
                .join(OrderItem, OrderItem.product_id == Product.id)
                .join(Order, Order.id == OrderItem.order_id)
                .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
            )
            if not ctx.is_superadmin and ctx.cafe_id:
                q = q.filter(Order.cafe_id == ctx.cafe_id)
            res = q.group_by(Product.name).order_by(Product.name).all()
            return [
                {"product": r.name, "qty": int(r.qty or 0), "revenue": float(r.revenue or 0.0)}
                for r in res
            ]

        return await run_in_threadpool(_query)

    # Analytics: cache for 30 minutes
    return await get_or_set(
        "stats_sales_table",
        cache_id,
        "analytics",
        _compute,
        ttl=1800,
        version="v1",
        stampede_key=cache_id,
    )
