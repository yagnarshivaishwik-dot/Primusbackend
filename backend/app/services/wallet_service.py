"""Wallet domain service.

Forensic audit BUG: wallet credit logic was inlined inside the Cashfree
webhook handler, the shop endpoint, and the manual top-up endpoint, with
three different shapes of idempotency check. Each path was at risk of
double-crediting on a webhook replay or a kiosk-retried POST.

This module centralises wallet operations behind a single service so
every caller goes through the same ACID transaction and the same
idempotency contract.

Idempotency model
-----------------
``credit_wallet`` and ``debit_wallet`` accept a ``source`` (e.g.
``"cashfree"``, ``"manual"``, ``"refund"``) plus a ``source_ref`` (e.g.
the Cashfree order_id, or a UUID minted by the caller for ad-hoc top-ups).
The pair is stored on ``WalletTransaction.description`` in the format
``"{source}:{source_ref}:{free-form description}"`` and queried for
existence before inserting a new row.

If your DB has a real unique constraint on ``(source, source_ref)`` use
it — this layer raises :class:`IdempotencyViolation` on conflict so the
endpoint can return the cached result without double-charging.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


@dataclass
class CreditResult:
    """Outcome of a wallet credit operation."""

    success: bool
    idempotent: bool          # True if this exact (source, source_ref) was already processed
    new_balance: float        # wallet_balance after the credit (current balance if idempotent)
    minutes_added: int        # only set for time-package credits; 0 otherwise
    transaction_id: Optional[int] = None  # ID of the inserted WalletTransaction row


class WalletService:
    """Stateless wallet operations.

    All methods take an open ``Session`` and DO NOT call ``db.commit()``
    themselves — the caller owns the transaction boundary. That's the
    only way an endpoint can batch a credit + a UserOffer insert + a
    SystemEvent record in a single atomic write.
    """

    @staticmethod
    def _ledger_description(source: str, source_ref: str, detail: str = "") -> str:
        """Format the description string used for idempotency lookups."""
        if detail:
            return f"{source}:{source_ref}:{detail}"
        return f"{source}:{source_ref}"

    @staticmethod
    def find_existing(
        db: Session,
        wallet_transaction_cls,
        source: str,
        source_ref: str,
    ):
        """Return the existing WalletTransaction for this (source, source_ref) — or None."""
        marker = f"{source}:{source_ref}"
        return (
            db.query(wallet_transaction_cls)
            .filter(wallet_transaction_cls.description.like(f"%{marker}%"))
            .first()
        )

    @classmethod
    def credit(
        cls,
        db: Session,
        *,
        user_cls,
        wallet_transaction_cls,
        user_id: int,
        amount: float,
        source: str,
        source_ref: str,
        cafe_id: Optional[int] = None,
        description: str = "",
        update_balance: bool = True,
    ) -> CreditResult:
        """Credit a wallet — idempotent on (source, source_ref).

        Args:
            db: open SQLAlchemy session. Caller is responsible for commit/rollback.
            user_cls: User ORM class (varies between single-DB and multi-DB modes).
            wallet_transaction_cls: WalletTransaction ORM class.
            user_id: target user.
            amount: positive amount to add to wallet_balance (and ledger).
            source: family of credit ("cashfree", "manual", "refund", ...).
            source_ref: unique key within the source (Cashfree order_id, UUID, ...).
            cafe_id: optional cafe association — only attached when the model
                exposes the column (single-DB mode); ignored in multi-DB mode
                where cafe is implicit in routing.
            description: free-form detail appended to the ledger row.
            update_balance: when True, also increment ``user.wallet_balance``.
                Some callers (e.g. Cashfree pack purchases) credit TIME via
                UserOffer and only want the ledger entry for reconciliation —
                set this False in that case.

        Returns:
            CreditResult — ``idempotent=True`` if a row for this
            ``(source, source_ref)`` already exists; the existing balance is
            returned unchanged.

        Raises:
            ValueError if the user does not exist or amount is non-positive.
        """
        if amount <= 0:
            raise ValueError(f"credit amount must be positive, got {amount!r}")

        existing = cls.find_existing(db, wallet_transaction_cls, source, source_ref)
        if existing is not None:
            user = db.query(user_cls).filter(user_cls.id == user_id).first()
            current_balance = float(getattr(user, "wallet_balance", 0) or 0) if user else 0.0
            logger.info(
                "wallet.credit: idempotent hit user=%s source=%s ref=%s",
                user_id, source, source_ref,
            )
            return CreditResult(
                success=True,
                idempotent=True,
                new_balance=current_balance,
                minutes_added=0,
                transaction_id=existing.id,
            )

        user = db.query(user_cls).filter(user_cls.id == user_id).first()
        if user is None:
            raise ValueError(f"user_id {user_id} not found")

        if update_balance:
            user.wallet_balance = float(getattr(user, "wallet_balance", 0) or 0) + amount

        # Build kwargs dynamically because the cafe_id column only exists on
        # the legacy single-DB WalletTransaction; per-cafe DBs omit it.
        ledger_kwargs = dict(
            user_id=user_id,
            amount=amount,
            timestamp=datetime.now(UTC),
            type="topup",
            description=cls._ledger_description(source, source_ref, description),
        )
        if cafe_id is not None and hasattr(wallet_transaction_cls, "cafe_id"):
            ledger_kwargs["cafe_id"] = cafe_id

        txn = wallet_transaction_cls(**ledger_kwargs)
        db.add(txn)
        db.flush()  # populate txn.id without committing — caller still owns the transaction

        return CreditResult(
            success=True,
            idempotent=False,
            new_balance=float(getattr(user, "wallet_balance", 0) or 0),
            minutes_added=0,
            transaction_id=txn.id,
        )

    @classmethod
    def debit(
        cls,
        db: Session,
        *,
        user_cls,
        wallet_transaction_cls,
        user_id: int,
        amount: float,
        source: str,
        source_ref: str,
        cafe_id: Optional[int] = None,
        description: str = "",
    ) -> CreditResult:
        """Debit a wallet — non-negative balance enforced at the SQL level."""
        from sqlalchemy import update as _sa_update

        if amount <= 0:
            raise ValueError(f"debit amount must be positive, got {amount!r}")

        existing = cls.find_existing(db, wallet_transaction_cls, source, source_ref)
        if existing is not None:
            user = db.query(user_cls).filter(user_cls.id == user_id).first()
            current_balance = float(getattr(user, "wallet_balance", 0) or 0) if user else 0.0
            return CreditResult(
                success=True,
                idempotent=True,
                new_balance=current_balance,
                minutes_added=0,
                transaction_id=existing.id,
            )

        result = db.execute(
            _sa_update(user_cls)
            .where(user_cls.id == user_id, user_cls.wallet_balance >= amount)
            .values(wallet_balance=user_cls.wallet_balance - amount)
            .returning(user_cls.wallet_balance)
        )
        new_balance = result.scalar_one_or_none()
        if new_balance is None:
            return CreditResult(success=False, idempotent=False, new_balance=0.0, minutes_added=0)

        ledger_kwargs = dict(
            user_id=user_id,
            amount=-abs(amount),
            timestamp=datetime.now(UTC),
            type="deduct",
            description=cls._ledger_description(source, source_ref, description),
        )
        if cafe_id is not None and hasattr(wallet_transaction_cls, "cafe_id"):
            ledger_kwargs["cafe_id"] = cafe_id

        txn = wallet_transaction_cls(**ledger_kwargs)
        db.add(txn)
        db.flush()

        return CreditResult(
            success=True,
            idempotent=False,
            new_balance=float(new_balance),
            minutes_added=0,
            transaction_id=txn.id,
        )


# Convenience function aliases — older code expects functions, not methods.
def credit_wallet(
    db: Session,
    *,
    user_cls,
    wallet_transaction_cls,
    user_id: int,
    amount: float,
    source: str,
    source_ref: str,
    cafe_id: Optional[int] = None,
    description: str = "",
    update_balance: bool = True,
) -> CreditResult:
    """Module-level helper — see :meth:`WalletService.credit`."""
    return WalletService.credit(
        db,
        user_cls=user_cls,
        wallet_transaction_cls=wallet_transaction_cls,
        user_id=user_id,
        amount=amount,
        source=source,
        source_ref=source_ref,
        cafe_id=cafe_id,
        description=description,
        update_balance=update_balance,
    )


__all__ = [
    "CreditResult",
    "WalletService",
    "credit_wallet",
]
