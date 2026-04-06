"""
Daily Revenue Aggregation Task.

Runs nightly at ~2am (UTC), computes per-cafe revenue totals from
wallet transactions, sessions, and orders, then writes to reports_daily.

Designed to be idempotent: re-running for the same date overwrites
the existing row via INSERT ... ON CONFLICT DO UPDATE.
"""

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

logger = logging.getLogger("primus.tasks.revenue_aggregation")


async def revenue_aggregation_loop() -> None:
    """Background loop: aggregate yesterday's revenue once per day."""
    logger.info("Revenue aggregation task started")

    # Compute seconds until next 2:00 AM UTC
    now = datetime.now(UTC)
    next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)

    wait_seconds = (next_run - now).total_seconds()
    logger.info("Revenue aggregation will run at %s UTC (%.0fs from now)", next_run, wait_seconds)
    await asyncio.sleep(wait_seconds)

    while True:
        try:
            await _run_aggregation_for_all_cafes()
        except Exception:
            logger.exception("Revenue aggregation loop error")

        # Sleep 24 hours until next run
        await asyncio.sleep(86400)


async def _run_aggregation_for_all_cafes() -> None:
    """Aggregate yesterday's data for every provisioned cafe."""
    target_date = (datetime.now(UTC) - timedelta(days=1)).date()
    logger.info("Starting revenue aggregation for %s", target_date)

    try:
        from app.db.global_db import global_session_factory
        from app.db.models_global import Cafe

        global_db = global_session_factory()
        try:
            cafes = global_db.query(Cafe).filter(Cafe.db_provisioned == True).all()  # noqa: E712
            cafe_ids = [c.id for c in cafes]
        finally:
            global_db.close()
    except Exception:
        logger.exception("Failed to fetch cafe list for aggregation")
        return

    successes = 0
    failures = 0
    for cafe_id in cafe_ids:
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _aggregate_cafe, cafe_id, target_date
            )
            successes += 1
        except Exception:
            logger.exception("Aggregation failed for cafe %d", cafe_id)
            failures += 1

    logger.info(
        "Revenue aggregation complete for %s: %d succeeded, %d failed",
        target_date, successes, failures,
    )


def _aggregate_cafe(cafe_id: int, report_date: date) -> None:
    """
    Compute and upsert the daily report for one cafe.
    Runs in a thread pool (synchronous SQLAlchemy).
    """
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from app.db.router import _derive_cafe_url

    cafe_url = _derive_cafe_url(cafe_id)
    engine = create_engine(cafe_url, pool_pre_ping=True, future=True)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        start_dt = datetime.combine(report_date, datetime.min.time())
        end_dt = start_dt + timedelta(days=1)

        # Wallet topups
        total_topups = db.execute(
            text(
                "SELECT COALESCE(SUM(amount), 0) FROM wallet_transactions "
                "WHERE type = 'topup' AND timestamp >= :s AND timestamp < :e"
            ),
            {"s": start_dt, "e": end_dt},
        ).scalar() or Decimal("0")

        # Wallet deductions (store as positive amount in report)
        total_deductions = db.execute(
            text(
                "SELECT COALESCE(ABS(SUM(amount)), 0) FROM wallet_transactions "
                "WHERE type = 'deduct' AND timestamp >= :s AND timestamp < :e"
            ),
            {"s": start_dt, "e": end_dt},
        ).scalar() or Decimal("0")

        # Sessions billed
        session_result = db.execute(
            text(
                "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM sessions "
                "WHERE paid = true AND start_time >= :s AND start_time < :e"
            ),
            {"s": start_dt, "e": end_dt},
        ).fetchone()
        total_sessions = session_result[0] if session_result else 0
        total_session_revenue = session_result[1] if session_result else Decimal("0")

        # Orders
        order_result = db.execute(
            text(
                "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM orders "
                "WHERE status = 'completed' AND created_at >= :s AND created_at < :e"
            ),
            {"s": start_dt, "e": end_dt},
        ).fetchone()
        total_orders = order_result[0] if order_result else 0
        total_order_revenue = order_result[1] if order_result else Decimal("0")

        # UPI payments (from payment_intents)
        total_upi = db.execute(
            text(
                "SELECT COALESCE(SUM(amount), 0) FROM payment_intents "
                "WHERE status = 'completed' AND provider = 'razorpay' "
                "AND created_at >= :s AND created_at < :e"
            ),
            {"s": start_dt, "e": end_dt},
        ).scalar() or Decimal("0")

        # Total revenue = session billing + orders + topups (cash/UPI inflows)
        total_revenue = Decimal(str(total_topups)) + Decimal(str(total_order_revenue))

        # Upsert into reports_daily
        db.execute(
            text(
                """
                INSERT INTO reports_daily (
                    report_date, total_revenue, total_sessions,
                    total_wallet_topups, total_wallet_deductions,
                    total_orders, total_order_revenue, total_upi_payments
                ) VALUES (
                    :rd, :rev, :sess, :topups, :deducts,
                    :orders, :order_rev, :upi
                )
                ON CONFLICT (report_date) DO UPDATE SET
                    total_revenue = EXCLUDED.total_revenue,
                    total_sessions = EXCLUDED.total_sessions,
                    total_wallet_topups = EXCLUDED.total_wallet_topups,
                    total_wallet_deductions = EXCLUDED.total_wallet_deductions,
                    total_orders = EXCLUDED.total_orders,
                    total_order_revenue = EXCLUDED.total_order_revenue,
                    total_upi_payments = EXCLUDED.total_upi_payments
                """
            ),
            {
                "rd": report_date,
                "rev": str(total_revenue),
                "sess": total_sessions,
                "topups": str(total_topups),
                "deducts": str(total_deductions),
                "orders": total_orders,
                "order_rev": str(total_order_revenue),
                "upi": str(total_upi),
            },
        )
        db.commit()

        # Refresh materialized views after daily aggregation
        try:
            db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_hourly_revenue"))
            db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_session_stats"))
            db.commit()
        except Exception:
            db.rollback()
            logger.debug("Materialized view refresh skipped (views may not exist yet)")

        logger.info(
            "Report for cafe %d on %s: revenue=%s sessions=%d orders=%d",
            cafe_id, report_date, total_revenue, total_sessions, total_orders,
        )

        # Mirror summary to global financial audit
        _mirror_daily_summary_to_audit(
            cafe_id=cafe_id,
            report_date=report_date,
            total_revenue=total_revenue,
            total_sessions=total_sessions,
            total_orders=total_orders,
        )

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        engine.dispose()


def _mirror_daily_summary_to_audit(
    cafe_id: int,
    report_date: date,
    total_revenue: Decimal,
    total_sessions: int,
    total_orders: int,
) -> None:
    """Write a daily summary audit entry to the global DB."""
    try:
        from app.db.global_db import global_session_factory
        from app.services.financial_audit import record_audit_event

        global_db = global_session_factory()
        try:
            record_audit_event(
                global_db=global_db,
                cafe_id=cafe_id,
                txn_type="daily_summary",
                amount=total_revenue,
                txn_ref=str(report_date),
                description=f"Daily summary {report_date}: {total_sessions} sessions, {total_orders} orders",
                metadata={
                    "report_date": str(report_date),
                    "total_sessions": total_sessions,
                    "total_orders": total_orders,
                },
            )
            global_db.commit()
        except Exception:
            global_db.rollback()
            logger.warning("Failed to mirror daily summary for cafe %d to global audit", cafe_id)
        finally:
            global_db.close()
    except Exception:
        logger.warning("Could not open global DB for audit mirror (cafe %d)", cafe_id)


async def aggregate_now(cafe_id: int, target_date: date | None = None) -> dict:
    """
    Manually trigger aggregation for a specific cafe and date.
    Used by the admin API endpoint.
    """
    if target_date is None:
        target_date = (datetime.now(UTC) - timedelta(days=1)).date()

    await asyncio.get_event_loop().run_in_executor(
        None, _aggregate_cafe, cafe_id, target_date
    )
    return {"cafe_id": cafe_id, "report_date": str(target_date), "status": "completed"}
