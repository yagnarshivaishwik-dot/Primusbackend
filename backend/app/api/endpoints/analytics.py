"""
Analytics endpoints — production-grade, multi-tenant.

cafe_id is ALWAYS extracted from the JWT token (AuthContext).
It is NEVER accepted from request params to prevent tenant cross-contamination.

Prefix: /api/analytics
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.api.endpoints.auth import require_role
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query
from app.db.dependencies import get_cafe_db as get_db
from app.db.models_cafe import (
    CafeUser,
    ClientPC,
    Order,
    OrderItem,
    Product,
    Session as PCSession,
    WalletTransaction,
)
from app.utils.cache import get_or_set

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _range(period: str | None, custom_start: str | None = None, custom_end: str | None = None):
    """Translate a period keyword to (start_dt, end_dt) UTC datetimes."""
    now = datetime.utcnow()
    if period == "yesterday":
        end = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return end - timedelta(days=1), end
    if period == "this_week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
        return start, start + timedelta(days=7)
    if period == "this_month":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = start.replace(month=start.month + 1) if start.month < 12 else start.replace(year=start.year + 1, month=1)
        return start, end
    if custom_start and custom_end:
        try:
            return datetime.fromisoformat(custom_start), datetime.fromisoformat(custom_end)
        except Exception:
            pass
    # default: today
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _cafe_filter(q, model, ctx: AuthContext):
    """Apply cafe_id filter when not superadmin."""
    if not ctx.is_superadmin and ctx.cafe_id:
        if hasattr(model, "cafe_id"):
            q = q.filter(model.cafe_id == ctx.cafe_id)
    return q


# ── 1. Summary ────────────────────────────────────────────────────────────────

@router.get("/summary")
async def analytics_summary(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    KPI summary for the Statistics page top row.
    Returns: total_sales, total_income, total_users, total_pcs,
             active_sessions, total_sessions, wallet_topups.
    """
    start_dt, end_dt = _range(period, start, end)
    cache_id = f"analytics_summary|{ctx.cafe_id}|{period}|{start_dt.date()}|{end_dt.date()}"

    async def _compute():
        def _q():
            # Active sessions (no end_time)
            active = db.query(PCSession).filter(PCSession.end_time.is_(None)).count()

            # Sessions in range
            total_sessions = (
                db.query(PCSession)
                .filter(PCSession.start_time >= start_dt, PCSession.start_time < end_dt)
                .count()
            )

            # Revenue from wallet deductions in range
            income_raw = (
                db.query(func.sum(WalletTransaction.amount))
                .filter(
                    WalletTransaction.timestamp >= start_dt,
                    WalletTransaction.timestamp < end_dt,
                    WalletTransaction.type == "deduct",
                )
                .scalar() or 0.0
            )

            # Wallet topups in range
            topups = (
                db.query(func.sum(WalletTransaction.amount))
                .filter(
                    WalletTransaction.timestamp >= start_dt,
                    WalletTransaction.timestamp < end_dt,
                    WalletTransaction.type == "topup",
                )
                .scalar() or 0.0
            )

            # Order sales in range
            sales = (
                db.query(func.sum(Order.total))
                .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
                .scalar() or 0.0
            )

            # Total users and PCs
            total_users = db.query(CafeUser).count()
            total_pcs   = db.query(ClientPC).count()

            return {
                "total_sales":    float(sales),
                "total_income":   float(-income_raw),
                "wallet_topups":  float(topups),
                "total_users":    int(total_users),
                "total_pcs":      int(total_pcs),
                "active_sessions": int(active),
                "total_sessions": int(total_sessions),
                "period": {
                    "key":   period or "today",
                    "start": start_dt.isoformat(),
                    "end":   end_dt.isoformat(),
                },
            }
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_summary", cache_id, "analytics", _compute, ttl=60, version="v1", stampede_key=cache_id)


# ── 2. Time Series ────────────────────────────────────────────────────────────

@router.get("/timeseries")
async def analytics_timeseries(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Hourly breakdown of revenue and session counts.
    Used by the AreaChart + BarChart in the Statistics page.
    """
    start_dt, end_dt = _range(period, start, end)
    cache_id = f"analytics_ts|{ctx.cafe_id}|{period}|{start_dt.date()}"

    async def _compute():
        def _q():
            # Revenue by hour
            rev_rows = (
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

            # Sessions by hour
            sess_rows = (
                db.query(
                    func.extract("hour", PCSession.start_time).label("hour"),
                    func.count().label("cnt"),
                )
                .filter(PCSession.start_time >= start_dt, PCSession.start_time < end_dt)
                .group_by("hour")
                .order_by("hour")
                .all()
            )

            revenue_by_hour  = [0.0] * 24
            sessions_by_hour = [0]   * 24
            for r in rev_rows:
                revenue_by_hour[int(r.hour)] = float(-(r.amt or 0.0))
            for r in sess_rows:
                sessions_by_hour[int(r.hour)] = int(r.cnt)

            # Build array of {hour, revenue, sessions} for recharts
            series = [
                {"hour": h, "label": f"{h:02d}:00", "revenue": revenue_by_hour[h], "sessions": sessions_by_hour[h]}
                for h in range(24)
            ]
            return {
                "series": series,
                "period": {"start": start_dt.isoformat(), "end": end_dt.isoformat()},
            }
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_ts", cache_id, "analytics", _compute, ttl=300, version="v1", stampede_key=cache_id)


# ── 3. Top Products ───────────────────────────────────────────────────────────

@router.get("/top-products")
async def analytics_top_products(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 50,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Product sales breakdown with price, qty, and revenue.
    Used by the Sales Table in the Statistics page.
    """
    start_dt, end_dt = _range(period, start, end)
    cache_id = f"analytics_products|{ctx.cafe_id}|{period}|{start_dt.date()}"

    async def _compute():
        def _q():
            rows = (
                db.query(
                    Product.name.label("name"),
                    Product.price.label("price"),
                    func.count(OrderItem.id).label("qty"),
                    func.sum(OrderItem.price * OrderItem.quantity).label("revenue"),
                )
                .join(OrderItem, OrderItem.product_id == Product.id)
                .join(Order, Order.id == OrderItem.order_id)
                .filter(Order.created_at >= start_dt, Order.created_at < end_dt)
                .group_by(Product.name, Product.price)
                .order_by(func.sum(OrderItem.price * OrderItem.quantity).desc())
                .limit(limit)
                .all()
            )
            return [
                {
                    "name":    r.name,
                    "price":   float(r.price or 0),
                    "qty":     int(r.qty or 0),
                    "revenue": float(r.revenue or 0),
                }
                for r in rows
            ]
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_products", cache_id, "analytics", _compute, ttl=300, version="v1", stampede_key=cache_id)


# ── 4. Users Activity ─────────────────────────────────────────────────────────

@router.get("/users")
async def analytics_users(
    period: str | None = None,
    start: str | None = None,
    end: str | None = None,
    limit: int = 50,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    User activity table: session count, spend, last active.
    Used by the Users Table in the Statistics page.
    """
    start_dt, end_dt = _range(period, start, end)
    cache_id = f"analytics_users|{ctx.cafe_id}|{period}|{start_dt.date()}"

    async def _compute():
        def _q():
            rows = (
                db.query(
                    CafeUser.id.label("user_id"),
                    CafeUser.name.label("name"),
                    func.count(PCSession.id).label("session_count"),
                    func.sum(PCSession.amount).label("total_spend"),
                    func.max(PCSession.start_time).label("last_active"),
                )
                .outerjoin(PCSession, PCSession.user_id == CafeUser.id)
                .filter(
                    PCSession.start_time >= start_dt,
                    PCSession.start_time < end_dt,
                )
                .group_by(CafeUser.id, CafeUser.name)
                .order_by(func.sum(PCSession.amount).desc().nullslast())
                .limit(limit)
                .all()
            )
            return [
                {
                    "user_id":       r.user_id,
                    "name":          r.name or "—",
                    "session_count": int(r.session_count or 0),
                    "total_spend":   float(r.total_spend or 0),
                    "last_active":   r.last_active.isoformat() if r.last_active else None,
                }
                for r in rows
            ]
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_users", cache_id, "analytics", _compute, ttl=300, version="v1", stampede_key=cache_id)


# ── 5. Peak Hours ─────────────────────────────────────────────────────────────

@router.get("/peak-hours")
async def analytics_peak_hours(
    period: str | None = None,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    24-hour activity heatmap data: sessions + revenue per hour.
    """
    start_dt, end_dt = _range(period)
    cache_id = f"analytics_peak|{ctx.cafe_id}|{period}|{start_dt.date()}"

    async def _compute():
        def _q():
            sess_rows = (
                db.query(
                    func.extract("hour", PCSession.start_time).label("hour"),
                    func.count().label("sessions"),
                    func.sum(PCSession.amount).label("revenue"),
                )
                .filter(PCSession.start_time >= start_dt, PCSession.start_time < end_dt)
                .group_by("hour")
                .order_by("hour")
                .all()
            )
            hours = {int(r.hour): {"sessions": int(r.sessions), "revenue": float(r.revenue or 0)} for r in sess_rows}
            return [
                {
                    "hour":     h,
                    "label":    f"{h:02d}:00",
                    "sessions": hours.get(h, {}).get("sessions", 0),
                    "revenue":  hours.get(h, {}).get("revenue",  0.0),
                }
                for h in range(24)
            ]
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_peak", cache_id, "analytics", _compute, ttl=900, version="v1", stampede_key=cache_id)


# ── 6. Payment Method Breakdown ───────────────────────────────────────────────

@router.get("/payment-breakdown")
async def analytics_payment_breakdown(
    period: str | None = None,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """
    Wallet transaction breakdown by type (topup / deduct / refund).
    Used by the PieChart in the Statistics page.
    """
    start_dt, end_dt = _range(period)
    cache_id = f"analytics_payment|{ctx.cafe_id}|{period}|{start_dt.date()}"

    async def _compute():
        def _q():
            rows = (
                db.query(
                    WalletTransaction.type.label("method"),
                    func.count().label("count"),
                    func.sum(WalletTransaction.amount).label("total"),
                )
                .filter(
                    WalletTransaction.timestamp >= start_dt,
                    WalletTransaction.timestamp < end_dt,
                )
                .group_by(WalletTransaction.type)
                .all()
            )
            return [
                {
                    "method": r.method,
                    "count":  int(r.count or 0),
                    "total":  abs(float(r.total or 0)),
                }
                for r in rows
            ]
        return await run_in_threadpool(_q)

    return await get_or_set("analytics_payment", cache_id, "analytics", _compute, ttl=300, version="v1", stampede_key=cache_id)


# ── 7. Superset Token Proxy (stub for future) ─────────────────────────────────

@router.get("/superset-token")
async def analytics_superset_token(
    dashboard_id: str | None = None,
    _=Depends(require_role("admin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Stub: returns Superset guest token when Superset is configured.
    Set SUPERSET_BASE_URL, SUPERSET_ADMIN_USER, SUPERSET_ADMIN_PASS in .env to activate.
    cafe_id RLS is enforced automatically.
    """
    import os
    base = os.getenv("SUPERSET_BASE_URL", "")
    if not base:
        return {
            "enabled": False,
            "message": "Superset not configured. Set SUPERSET_BASE_URL in .env.",
        }

    import httpx
    async with httpx.AsyncClient() as client:
        # Login
        login = await client.post(f"{base}/api/v1/security/login", json={
            "username": os.getenv("SUPERSET_ADMIN_USER", "admin"),
            "password": os.getenv("SUPERSET_ADMIN_PASS", "admin"),
            "provider": "db",
        })
        access_token = login.json().get("access_token", "")

        # Guest token with RLS
        resp = await client.post(
            f"{base}/api/v1/security/guest_token",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "resources": [{"type": "dashboard", "id": dashboard_id or ""}],
                "rls":       [{"clause": f"cafe_id = '{ctx.cafe_id}'"}],
                "user":      {"username": f"cafe_{ctx.cafe_id}", "first_name": "Primus", "last_name": "Cafe"},
            },
        )
    token = resp.json().get("token", "")
    return {
        "enabled":   True,
        "token":     token,
        "embed_url": f"{base}/embedded/dashboard/{dashboard_id}",
    }
