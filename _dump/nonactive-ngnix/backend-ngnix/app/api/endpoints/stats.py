from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.endpoints.auth import require_role
from app.database import SessionLocal
from app.models import PC, Order, OrderItem, User, WalletTransaction
from app.models import Session as PCSession

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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
def stats_summary(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    start_dt, end_dt = _range(period, start, end)
    # Active sessions
    active_sessions = db.query(PCSession).filter(PCSession.end_time.is_(None)).count()
    todays_sessions = (
        db.query(PCSession)
        .filter(PCSession.start_time >= start_dt, PCSession.start_time < end_dt)
        .count()
    )
    # Revenue today
    revenue_today = (
        db.query(func.sum(WalletTransaction.amount))
        .filter(
            WalletTransaction.timestamp >= start_dt,
            WalletTransaction.timestamp < end_dt,
            WalletTransaction.type == "deduct",
        )
        .scalar()
        or 0.0
    )
    # Total income breakdown by method from orders (if needed)
    order_total = (
        db.query(func.sum(Order.total))
        .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
        .scalar()
        or 0.0
    )
    # Total users
    total_users = db.query(User).count()
    # Total PCs
    total_pcs = db.query(PC).count()
    return {
        "active_sessions": active_sessions,
        "todays_sessions": todays_sessions,
        "revenue": -revenue_today,  # wallet deducts as income
        "orders_total": order_total,
        "total_users": total_users,
        "total_pcs": total_pcs,
        "period": {"start": start_dt, "end": end_dt},
    }


# Top users by spending
@router.get("/top-users")
def top_users(db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    res = (
        db.query(User.name, func.sum(WalletTransaction.amount).label("spent"))
        .join(WalletTransaction, WalletTransaction.user_id == User.id)
        .filter(WalletTransaction.type == "deduct")
        .group_by(User.name)
        .order_by(func.sum(WalletTransaction.amount))
        .limit(10)
        .all()
    )
    # Show as positive
    return [{"username": r.name, "spent": -r.spent} for r in res]


# Peak hours (sessions started by hour of day)
@router.get("/peak-hours")
def peak_hours(db: Session = Depends(get_db), current_user=Depends(require_role("admin"))):
    res = (
        db.query(
            func.extract("hour", PCSession.start_time).label("hour"), func.count().label("count")
        )
        .group_by("hour")
        .order_by("hour")
        .all()
    )
    return [{"hour": int(r.hour), "count": r.count} for r in res]


# Sales series by hour for a given period
@router.get("/sales-series")
def sales_series(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    start_dt, end_dt = _range(period, start, end)
    res = (
        db.query(
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


# Users series (new members by hour)
@router.get("/users-series")
def users_series(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    start_dt, end_dt = _range(period, start, end)
    res = (
        db.query(func.extract("hour", User.created_at).label("hour"), func.count().label("cnt"))
        .filter(User.created_at >= start_dt, User.created_at < end_dt)
        .group_by("hour")
        .order_by("hour")
        .all()
    )
    out = [0] * 24
    for r in res:
        out[int(r.hour)] = int(r.cnt)
    return {"start": start_dt, "end": end_dt, "hours": list(range(24)), "values": out}


# Sales table (gamepasses/guests)
@router.get("/sales-table")
def sales_table(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin")),
):
    start_dt, end_dt = _range(period, start, end)
    # Aggregate sold quantities and totals from OrderItem + Product
    from app.models import Product

    res = (
        db.query(
            Product.name,
            func.count(OrderItem.id).label("qty"),
            func.sum(OrderItem.price).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
        .group_by(Product.name)
        .order_by(Product.name)
        .all()
    )
    return [
        {"product": r.name, "qty": int(r.qty or 0), "revenue": float(r.revenue or 0.0)} for r in res
    ]
