"""Celery tasks that deliver Firebase Cloud Messaging pushes to the mobile app.

Credentials are read lazily from the environment so that local/dev nodes
that don't run pushes can import this module without ``firebase-admin``
being configured:

    FIREBASE_ADMIN_CREDENTIALS_PATH   path to a service-account JSON file
    FIREBASE_ADMIN_CREDENTIALS_JSON   inline JSON (useful in CI / Vault)

When neither is set the tasks log a warning and return early. They
never raise in the caller path — the web request must never fail
because of a transport-level push problem.

Token hygiene: FCM's ``UNREGISTERED`` and ``INVALID_ARGUMENT`` failure
codes mean the token is dead on the device side; we soft-revoke those
rows on the ``device_tokens`` table by setting ``revoked_at`` so the
next send cycle skips them.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Iterable

from celery import shared_task

logger = logging.getLogger(__name__)

_FIREBASE_READY: bool | None = None  # tri-state: None=unattempted, True/False=attempted


def _init_firebase() -> bool:
    """Idempotent lazy init. Returns True if Firebase Admin is usable."""
    global _FIREBASE_READY
    if _FIREBASE_READY is not None:
        return _FIREBASE_READY

    try:
        import firebase_admin  # type: ignore[import-not-found]
        from firebase_admin import credentials  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover — firebase-admin not installed
        logger.warning("[push] firebase-admin not installed: %s", exc)
        _FIREBASE_READY = False
        return False

    if firebase_admin._apps:  # already initialized
        _FIREBASE_READY = True
        return True

    cred_path = os.getenv("FIREBASE_ADMIN_CREDENTIALS_PATH", "").strip()
    cred_json = os.getenv("FIREBASE_ADMIN_CREDENTIALS_JSON", "").strip()

    try:
        if cred_path:
            cred = credentials.Certificate(cred_path)
        elif cred_json:
            cred = credentials.Certificate(json.loads(cred_json))
        else:
            logger.warning(
                "[push] no FIREBASE_ADMIN_CREDENTIALS_{PATH,JSON} — pushes disabled"
            )
            _FIREBASE_READY = False
            return False
        firebase_admin.initialize_app(cred)
    except Exception as exc:
        logger.exception("[push] firebase init failed: %s", exc)
        _FIREBASE_READY = False
        return False

    _FIREBASE_READY = True
    return True


def _active_tokens_for_user(user_id: int) -> list[str]:
    """Read non-revoked device tokens for a user from the global DB.

    Returns an empty list if the DB layer is unavailable — the task is
    best-effort and must not raise.
    """
    try:
        from app.db.dependencies import get_global_db_session  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover — helper path may differ in single-DB mode
        try:
            from app.db.database import SessionLocal as get_global_db_session  # type: ignore
        except Exception:
            return []

    try:
        from app.db.models_global import DeviceToken  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.models import DeviceToken  # type: ignore[attr-defined]
        except Exception:
            return []

    try:
        session = get_global_db_session()
    except TypeError:  # get_global_db_session was a generator
        session = next(get_global_db_session())  # type: ignore[arg-type]

    try:
        rows = (
            session.query(DeviceToken)
            .filter(DeviceToken.user_id == user_id, DeviceToken.revoked_at.is_(None))
            .all()
        )
        return [r.token for r in rows if getattr(r, "token", None)]
    except Exception as exc:
        logger.warning("[push] failed to load device tokens: %s", exc)
        return []
    finally:
        try:
            session.close()
        except Exception:
            pass


def _revoke_tokens(tokens: Iterable[str]) -> None:
    tokens = list(tokens)
    if not tokens:
        return
    try:
        from app.db.dependencies import get_global_db_session  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.db.database import SessionLocal as get_global_db_session  # type: ignore
        except Exception:
            return
    try:
        from app.db.models_global import DeviceToken  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.models import DeviceToken  # type: ignore[attr-defined]
        except Exception:
            return

    try:
        session = get_global_db_session()
    except TypeError:
        session = next(get_global_db_session())  # type: ignore[arg-type]

    try:
        now = datetime.now(timezone.utc)
        (
            session.query(DeviceToken)
            .filter(DeviceToken.token.in_(tokens))
            .update({"revoked_at": now}, synchronize_session=False)
        )
        session.commit()
    except Exception as exc:
        logger.warning("[push] failed to revoke tokens: %s", exc)
        session.rollback()
    finally:
        try:
            session.close()
        except Exception:
            pass


def _send_fcm(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any],
) -> str:
    """Fan out a notification to every token. Returns comma-joined FCM message IDs."""
    if not tokens:
        return ""
    if not _init_firebase():
        return ""

    from firebase_admin import messaging  # type: ignore[import-not-found]

    # Stringify data payload (FCM requires all values to be strings).
    data_str = {k: str(v) for k, v in data.items()}

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=data_str,
        android=messaging.AndroidConfig(priority="high"),
        apns=messaging.APNSConfig(
            headers={"apns-priority": "10"},
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound="default", content_available=True),
            ),
        ),
    )

    try:
        response = messaging.send_multicast(message)
    except Exception as exc:
        logger.exception("[push] send_multicast failed: %s", exc)
        raise

    dead: list[str] = []
    ids: list[str] = []
    for idx, resp in enumerate(response.responses):
        if resp.success and resp.message_id:
            ids.append(resp.message_id)
            continue
        err = resp.exception
        code = getattr(err, "code", None) if err else None
        if code in {
            "registration-token-not-registered",
            "invalid-argument",
            "invalid-registration-token",
        }:
            dead.append(tokens[idx])

    if dead:
        _revoke_tokens(dead)

    return ",".join(ids)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=5,
)
def send_push_booking_confirmed(self, booking_id: int) -> str:
    """Notify the booking owner that their booking is confirmed."""
    from app.models import Booking  # lazy to avoid import cycles

    user_id = _lookup_user_id_for_booking(booking_id)
    if not user_id:
        return ""
    title = "Booking confirmed"
    body = f"Your PC is reserved. Booking #{booking_id}"
    _persist_inbox(
        user_id, title, body,
        category="booking",
        deep_link=f"/booking/{booking_id}/confirmed",
    )
    tokens = _active_tokens_for_user(user_id)
    return _send_fcm(
        tokens,
        title=title,
        body=body,
        data={"type": "booking_confirmed", "booking_id": booking_id},
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=5,
)
def send_push_booking_reminder(self, booking_id: int, minutes_before: int) -> str:
    """Notify the user N minutes before their booking start."""
    user_id = _lookup_user_id_for_booking(booking_id)
    if not user_id:
        return ""
    title = "Your session starts soon"
    body = f"Booking #{booking_id} starts in {minutes_before} minutes"
    _persist_inbox(
        user_id, title, body,
        category="booking",
        deep_link=f"/booking/{booking_id}/confirmed",
    )
    tokens = _active_tokens_for_user(user_id)
    return _send_fcm(
        tokens,
        title=title,
        body=body,
        data={
            "type": "booking_reminder",
            "booking_id": booking_id,
            "minutes_before": minutes_before,
        },
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=120,
    max_retries=5,
)
def send_push_payment_failed(self, payment_id: int | str) -> str:
    """Notify the user that their payment failed."""
    user_id = _lookup_user_id_for_payment(payment_id)
    if not user_id:
        return ""
    title = "Payment failed"
    body = "We couldn't confirm your payment. Tap to retry."
    _persist_inbox(
        user_id, title, body,
        category="payment",
        deep_link="/profile/history",
    )
    tokens = _active_tokens_for_user(user_id)
    return _send_fcm(
        tokens,
        title=title,
        body=body,
        data={"type": "payment_failed", "payment_id": str(payment_id)},
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lookup_user_id_for_booking(booking_id: int) -> int | None:
    try:
        from app.db.dependencies import get_cafe_db as _get_db  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.db.database import SessionLocal as _get_db  # type: ignore[attr-defined]
        except Exception:
            return None

    try:
        from app.models import Booking
    except Exception:
        return None

    try:
        session = _get_db()
    except TypeError:
        session = next(_get_db())  # type: ignore[arg-type]
    try:
        row = session.query(Booking).filter_by(id=booking_id).first()
        return getattr(row, "user_id", None) if row else None
    finally:
        try:
            session.close()
        except Exception:
            pass


def _lookup_user_id_for_payment(payment_id: int | str) -> int | None:
    try:
        from app.db.models_cafe import PaymentIntent  # type: ignore[attr-defined]
    except Exception:
        return None
    try:
        from app.db.dependencies import get_cafe_db as _get_db  # type: ignore[attr-defined]
    except Exception:
        try:
            from app.db.database import SessionLocal as _get_db  # type: ignore[attr-defined]
        except Exception:
            return None
    try:
        session = _get_db()
    except TypeError:
        session = next(_get_db())  # type: ignore[arg-type]
    try:
        row = session.query(PaymentIntent).filter_by(id=payment_id).first()
        return getattr(row, "user_id", None) if row else None
    finally:
        try:
            session.close()
        except Exception:
            pass


def _persist_inbox(
    user_id: int,
    title: str,
    body: str,
    category: str,
    deep_link: str | None = None,
) -> None:
    """Write the notification to the user's inbox so the in-app list shows it.

    Best-effort -- never raises into the caller, since FCM delivery is the
    primary obligation of these tasks.
    """
    try:
        from app.db.global_db import global_session_factory as _Session
        from app.db.models_global import NotificationInbox
    except Exception:
        return
    db = _Session()
    try:
        row = NotificationInbox(
            user_id=user_id,
            title=title,
            body=body,
            category=category,
            deep_link=deep_link,
        )
        db.add(row)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist inbox for user {user_id}: {e}")
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass
