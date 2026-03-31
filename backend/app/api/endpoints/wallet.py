"""
Wallet API endpoints with atomic operations.

All monetary values are stored as floats.
CRITICAL: All balance modifications use atomic SQL to prevent race conditions.
"""

from typing import TYPE_CHECKING
import os
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import update
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.models import User, WalletTransaction
from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query, enforce_cafe_ownership
from app.db.dependencies import get_cafe_db as get_db
from app.schemas import WalletAction, WalletTransactionOut
from app.utils.cache import publish_invalidation

if TYPE_CHECKING:
    from app.models import User

router = APIRouter()

# Configuration: Max topup
WALLET_TOPUP_MAX = float(os.getenv("WALLET_TOPUP_MAX", "100000.0"))


@router.get("/balance")
def wallet_balance(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """
    Get the current wallet balance and coins for the authenticated user.
    """
    return {
        "balance": current_user.wallet_balance or 0.0,
        "coins": current_user.coins_balance or 0
    }


@router.get("/transactions", response_model=list[WalletTransactionOut])
def list_transactions(
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> list[WalletTransactionOut]:
    """
    List all wallet transactions for the authenticated user.
    """
    txs = (
        scoped_query(db, WalletTransaction, ctx)
        .filter(WalletTransaction.user_id == current_user.id)
        .order_by(WalletTransaction.timestamp.desc())
        .all()
    )
    return txs


@router.post("/topup", response_model=WalletTransactionOut)
async def topup_wallet(
    action: WalletAction,
    request: Request,
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WalletTransactionOut:
    """
    Top up wallet balance. Admin only for manual topups.
    """
    def _topup() -> WalletTransaction:
        if current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only admins can manually top up wallets.",
            )

        amount = action.amount
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        if amount > WALLET_TOPUP_MAX:
            raise HTTPException(
                status_code=400,
                detail=f"Amount exceeds maximum allowed ({WALLET_TOPUP_MAX}).",
            )

        target_user_id = action.user_id if action.user_id else current_user.id

        # Verify target user belongs to same cafe
        if action.user_id:
            target_user = db.query(User).filter_by(id=target_user_id).first()
            enforce_cafe_ownership(target_user, ctx)

        # ATOMIC UPDATE: Prevents race conditions
        result = db.execute(
            update(User)
            .where(User.id == target_user_id)
            .values(wallet_balance=User.wallet_balance + amount)
            .returning(User.wallet_balance)
        )
        new_balance = result.scalar_one_or_none()

        if new_balance is None:
            raise HTTPException(status_code=404, detail="Target user not found")

        # Create transaction record
        tx = WalletTransaction(
            user_id=target_user_id,
            cafe_id=ctx.cafe_id,
            amount=amount,
            timestamp=datetime.now(UTC),
            type="topup",
            description=action.description or f"Manual topup by admin {current_user.id}",
        )
        db.add(tx)

        try:
            log_action(
                db,
                target_user_id,
                "wallet_topup",
                f"Amount:{amount} User:{target_user_id}",
                str(request.client.host) if request.client else None,
            )
        except Exception:
            pass

        db.commit()
        db.refresh(tx)
        return tx

    # Fraud check (non-blocking: fail-open if Redis unavailable)
    try:
        from app.services.fraud import check_topup
        fraud_result = await check_topup(
            user_id=action.user_id or current_user.id,
            cafe_id=ctx.cafe_id or 0,
            amount=Decimal(str(action.amount)),
            client_ip=str(request.client.host) if request.client else None,
        )
        if not fraud_result.allowed:
            raise HTTPException(status_code=429, detail=fraud_result.reason or "Transaction blocked")
    except HTTPException:
        raise
    except Exception:
        pass  # fail-open

    tx = await run_in_threadpool(_topup)

    # Audit mirror (fire-and-forget)
    try:
        from app.services.financial_audit import mirror_to_global_async
        await mirror_to_global_async(
            cafe_id=ctx.cafe_id or 0,
            txn_type="wallet_topup",
            amount=Decimal(str(action.amount)),
            txn_ref=str(tx.id),
            user_id=action.user_id or current_user.id,
            description=action.description or "Manual topup",
        )
    except Exception:
        pass  # non-critical

    await publish_invalidation({
        "scope": "analytics",
        "items": [
            {"type": "stats_summary", "id": "*"},
            {"type": "stats_top_users", "id": "*"},
            {"type": "stats_sales_series", "id": "*"},
            {"type": "stats_sales_table", "id": "*"},
        ],
    })

    return tx


@router.post("/deduct", response_model=WalletTransactionOut)
async def deduct_wallet(
    action: WalletAction,
    current_user: User = Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> WalletTransactionOut:
    """
    Deduct from wallet balance.
    Uses atomic SQL with balance check to prevent overdraft and race conditions.
    """
    def _deduct() -> WalletTransaction:
        amount = action.amount
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        target_user_id = action.user_id if (action.user_id and current_user.role == "admin") else current_user.id

        # Verify target user belongs to same cafe
        if action.user_id and current_user.role == "admin":
            target_user = db.query(User).filter_by(id=target_user_id).first()
            enforce_cafe_ownership(target_user, ctx)

        # ATOMIC UPDATE with balance check: Only deduct if sufficient funds
        result = db.execute(
            update(User)
            .where(
                User.id == target_user_id,
                User.wallet_balance >= amount  # Prevents overdraft
            )
            .values(wallet_balance=User.wallet_balance - amount)
            .returning(User.wallet_balance)
        )
        new_balance = result.scalar_one_or_none()

        if new_balance is None:
            # Either user not found or insufficient balance
            user_exists = db.query(User).filter_by(id=target_user_id).first()
            if not user_exists:
                raise HTTPException(status_code=404, detail="Target user not found")
            raise HTTPException(status_code=400, detail="Insufficient balance")

        # Create transaction record (negative amount for deduction)
        tx = WalletTransaction(
            user_id=target_user_id,
            cafe_id=ctx.cafe_id,
            amount=-amount,
            timestamp=datetime.now(UTC),
            type="deduct",
            description=action.description,
        )
        db.add(tx)
        db.commit()
        db.refresh(tx)
        return tx

    # Fraud check (non-blocking: fail-open if Redis unavailable)
    try:
        from app.services.fraud import check_deduct
        fraud_result = await check_deduct(
            user_id=action.user_id or current_user.id,
            cafe_id=ctx.cafe_id or 0,
            amount=Decimal(str(action.amount)),
        )
        if not fraud_result.allowed:
            raise HTTPException(status_code=429, detail=fraud_result.reason or "Transaction blocked")
    except HTTPException:
        raise
    except Exception:
        pass  # fail-open

    tx = await run_in_threadpool(_deduct)

    # Audit mirror (fire-and-forget)
    try:
        from app.services.financial_audit import mirror_to_global_async
        await mirror_to_global_async(
            cafe_id=ctx.cafe_id or 0,
            txn_type="wallet_deduct",
            amount=Decimal(str(action.amount)),
            txn_ref=str(tx.id),
            user_id=action.user_id or current_user.id,
            description=action.description or "Deduction",
        )
    except Exception:
        pass  # non-critical

    await publish_invalidation({
        "scope": "analytics",
        "items": [
            {"type": "stats_summary", "id": "*"},
            {"type": "stats_top_users", "id": "*"},
            {"type": "stats_sales_series", "id": "*"},
            {"type": "stats_sales_table", "id": "*"},
        ],
    })

    return tx
