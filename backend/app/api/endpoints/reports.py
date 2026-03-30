"""
Daily revenue report endpoints.

Provides access to per-cafe aggregated daily reports from the
reports_daily table (computed by the revenue aggregation background task).
"""

import logging
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session as DBSession

from app.auth.context import AuthContext, get_auth_context, require_role
from app.database import get_db
from app.schemas import ReportDailyOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/daily", response_model=list[ReportDailyOut])
def list_daily_reports(
    cafe_id: int | None = Query(None, description="Filter by cafe (superadmin only)"),
    start_date: date | None = Query(None, description="Inclusive start date (YYYY-MM-DD)"),
    end_date: date | None = Query(None, description="Inclusive end date (YYYY-MM-DD)"),
    limit: int = Query(30, ge=1, le=365),
    current_user=Depends(require_role("superadmin", "cafeadmin", "admin", "owner")),
    ctx: AuthContext = Depends(get_auth_context),
    db: DBSession = Depends(get_db),
):
    """
    List daily revenue reports.

    - Superadmin: can query any cafe by passing cafe_id
    - Cafeadmin/owner: automatically scoped to their cafe
    """
    if ctx.has_role("superadmin"):
        target_cafe_id = cafe_id
    else:
        target_cafe_id = ctx.cafe_id
        if not target_cafe_id:
            raise HTTPException(status_code=400, detail="cafe_id required")

    # Build date filters
    if end_date is None:
        end_date = datetime.now(UTC).date()
    if start_date is None:
        start_date = end_date - timedelta(days=limit - 1)

    try:
        if target_cafe_id:
            # Query per-cafe DB
            from app.db.router import cafe_db_router
            cafe_session = cafe_db_router.get_session(target_cafe_id)
            try:
                rows = cafe_session.execute(
                    text(
                        "SELECT id, report_date, total_revenue, total_sessions, "
                        "total_wallet_topups, total_wallet_deductions, "
                        "total_orders, total_order_revenue, total_upi_payments "
                        "FROM reports_daily "
                        "WHERE report_date >= :s AND report_date <= :e "
                        "ORDER BY report_date DESC LIMIT :lim"
                    ),
                    {"s": start_date, "e": end_date, "lim": limit},
                ).fetchall()
            finally:
                cafe_session.close()
        else:
            # Superadmin with no cafe_id: query global audit table for summary
            rows = db.execute(
                text(
                    "SELECT id, txn_ref as report_date, amount as total_revenue, "
                    "0 as total_sessions, 0 as total_wallet_topups, "
                    "0 as total_wallet_deductions, 0 as total_orders, "
                    "0 as total_order_revenue, 0 as total_upi_payments "
                    "FROM platform_financial_audit "
                    "WHERE txn_type = 'daily_summary' "
                    "AND created_at::date >= :s AND created_at::date <= :e "
                    "ORDER BY created_at DESC LIMIT :lim"
                ),
                {"s": start_date, "e": end_date, "lim": limit},
            ).fetchall()
    except Exception as exc:
        logger.exception("Failed to fetch daily reports")
        raise HTTPException(status_code=500, detail="Failed to fetch reports") from exc

    return [
        {
            "id": r[0],
            "report_date": str(r[1]),
            "total_revenue": str(r[2]),
            "total_sessions": r[3],
            "total_wallet_topups": str(r[4]),
            "total_wallet_deductions": str(r[5]),
            "total_orders": r[6],
            "total_order_revenue": str(r[7]),
            "total_upi_payments": str(r[8]),
        }
        for r in rows
    ]


@router.post("/daily/aggregate")
async def trigger_aggregation(
    cafe_id: int | None = Query(None),
    target_date: date | None = Query(None),
    current_user=Depends(require_role("superadmin")),
    ctx: AuthContext = Depends(get_auth_context),
):
    """
    Manually trigger revenue aggregation for a cafe and date. Superadmin only.
    """
    from app.tasks.revenue_aggregation import aggregate_now
    from app.db.global_db import global_session_factory
    from app.db.models_global import Cafe

    if cafe_id is None:
        raise HTTPException(status_code=400, detail="cafe_id is required")

    # Verify cafe exists
    global_db = global_session_factory()
    try:
        cafe = global_db.query(Cafe).filter_by(id=cafe_id).first()
        if not cafe:
            raise HTTPException(status_code=404, detail="Cafe not found")
    finally:
        global_db.close()

    result = await aggregate_now(cafe_id=cafe_id, target_date=target_date)
    return result
