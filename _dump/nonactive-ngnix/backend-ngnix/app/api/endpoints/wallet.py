from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.models import User, WalletTransaction

if TYPE_CHECKING:
    from app.models import User
import os
from datetime import UTC, datetime

from app.api.endpoints.audit import log_action
from app.api.endpoints.auth import get_current_user
from app.database import get_db
from app.schemas import WalletAction, WalletTransactionOut

router = APIRouter()

# Configuration from environment
WALLET_TOPUP_MAX = float(os.getenv("WALLET_TOPUP_MAX", "10000"))


# Get current wallet balance
@router.get("/balance")
def wallet_balance(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    """
    Get the current wallet balance for the authenticated user.

    Args:
        current_user: Authenticated user from JWT token
        db: Database session

    Returns:
        Dictionary with wallet balance
    """
    # Use current_user directly instead of re-querying
    return {"balance": current_user.wallet_balance}


# List all wallet transactions for user
@router.get("/transactions", response_model=list[WalletTransactionOut])
def list_transactions(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[WalletTransactionOut]:
    """
    List all wallet transactions for the authenticated user.

    Args:
        current_user: Authenticated user from JWT token
        db: Database session

    Returns:
        List of wallet transactions ordered by timestamp (newest first)
    """
    txs = (
        db.query(WalletTransaction)
        .filter_by(user_id=current_user.id)
        .order_by(WalletTransaction.timestamp.desc())
        .all()
    )
    return txs


# Top up wallet (admin only for manual topups)
# For self-service topups, use payment gateway integration instead
@router.post("/topup", response_model=WalletTransactionOut)
def topup_wallet(
    action: WalletAction,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WalletTransactionOut:
    # Require admin role for manual topup
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can manually top up wallets. Use payment gateway for self-service topups.",
        )

    # Validate amount
    if action.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if action.amount > WALLET_TOPUP_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Amount exceeds maximum allowed ({WALLET_TOPUP_MAX}). Contact administrator for larger topups.",
        )

    # Merge current_user into this session to ensure it's attached
    user = db.merge(current_user)
    user.wallet_balance += action.amount
    tx = WalletTransaction(
        user_id=user.id,
        amount=action.amount,
        timestamp=datetime.now(UTC),
        type="topup",
        description=action.description or f"Manual topup by admin {user.id}",
    )
    db.add(tx)

    # Audit log wallet topup
    try:
        log_action(
            db,
            user.id,
            "wallet_topup",
            f"Amount:{action.amount} User:{user.id} Email:{user.email}",
            str(request.client.host) if request.client else None,
        )
    except Exception:
        pass  # Don't fail if audit logging fails

    db.commit()
    db.refresh(tx)
    return tx


# Deduct from wallet (used for session billing etc.)
@router.post("/deduct", response_model=WalletTransactionOut)
def deduct_wallet(
    action: WalletAction,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WalletTransactionOut:
    """
    Deduct amount from wallet balance.

    Args:
        action: WalletAction containing amount and description
        current_user: Authenticated user
        db: Database session

    Returns:
        WalletTransactionOut: Created transaction record

    Raises:
        HTTPException: If insufficient balance
    """
    # Use current_user directly instead of re-querying
    if current_user.wallet_balance < action.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    current_user.wallet_balance -= action.amount
    tx = WalletTransaction(
        user_id=current_user.id,
        amount=-action.amount,
        timestamp=datetime.utcnow(),
        type="deduct",
        description=action.description,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx
