import html
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.endpoints.auth import get_current_user
from app.api.endpoints.remote_command import queue_device_event
from app.auth.context import AuthContext, get_auth_context
from app.auth.tenant import scoped_query
from app.db.dependencies import MULTI_DB_ENABLED, get_cafe_db as get_db
from app.db.global_db import global_session_factory
# `User` here is ONLY used for the role-lookup that runs against the GLOBAL DB
# (lines around `global_session_factory()` in the GET endpoint). For the
# cafe-DB lookups (resolving pc + current user from the cafe session) we use
# the cafe-scoped variants imported via the MULTI_DB branch below.
from app.models import User
from app.schemas import ChatMessageIn, ChatMessageOut
from app.ws import admin as ws_admin
from app.ws.auth import build_event
from app.ws.pc import notify_pc

# Admin-side role set. Anything outside this is treated as a customer/end-user
# (kiosk-side sender). Lower-case to match the values stored in users.role.
_ADMIN_ROLES = {"admin", "cafeadmin", "owner", "superadmin", "staff"}

# In multi-DB mode the chat row is written to the per-cafe Postgres instance,
# whose `chat_messages` table does NOT have a `cafe_id` column (the cafe is
# implicit in which DB you're connected to). Using the legacy model (which
# declares cafe_id) causes SQLAlchemy to emit INSERT INTO chat_messages
# (..., cafe_id, ...) and Postgres rejects with UndefinedColumn.
#
# Same applies to ClientPC and the user lookup keyed off pc.current_user_id —
# both queries run against the cafe DB session, so they need the cafe-scoped
# models. Previously chat.py imported ClientPC + User from app.models
# (legacy schema with cafe_id columns); the resulting `db.query(ClientPC)`
# against the cafe DB threw silently inside the try/except (no cafe_id
# column in cafe schema), `pc` stayed None, and the WS chat.message
# payload's `client_name` defaulted to "PC-{cm.pc_id}" — surfacing in the
# admin's NotificationBell as "PC-2" instead of the actual PC.name. Same
# silent failure on the user_obj lookup made `user_name` default to "Guest".
# Switch to cafe-scoped models in MULTI_DB mode. Same fix pattern as
# TECH_DEBT #17 (Cashfree webhook).
if MULTI_DB_ENABLED:
    from app.db.models_cafe import (
        ChatMessage,           # no cafe_id field
        ClientPC,              # cafe-scoped — has name, current_user_id
        CafeUser as _CafeChatUser,  # cafe-scoped user, FK target of pc.current_user_id
    )
else:
    from app.models import ChatMessage, ClientPC  # type: ignore[no-redef]
    _CafeChatUser = User  # legacy: pc.current_user_id FKs to global users.id

router = APIRouter()


# Send message
@router.post("/", response_model=ChatMessageOut)
async def send_message(
    msg: ChatMessageIn,
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    # Sanitize message to prevent XSS attacks
    sanitized_message = html.escape(msg.message) if msg.message else ""

    # Validate message length
    if len(sanitized_message) > 5000:
        raise HTTPException(status_code=400, detail="Message too long (max 5000 characters)")

    # cafe_id only lives on the legacy single-DB ChatMessage model; in multi-DB
    # the column is absent from the per-cafe table and SQLAlchemy will 500 if
    # we set it on a model that doesn't declare it.
    chat_kwargs = dict(
        from_user_id=current_user.id,
        to_user_id=msg.to_user_id,
        pc_id=msg.pc_id,
        message=sanitized_message,
        timestamp=datetime.now(UTC),
        read=False,
    )
    if not MULTI_DB_ENABLED:
        chat_kwargs["cafe_id"] = ctx.cafe_id
    cm = ChatMessage(**chat_kwargs)
    db.add(cm)
    db.commit()
    db.refresh(cm)

    # Determine client name and logged-in user name for this PC
    client_name: str | None = None
    user_name: str = "Guest"
    if cm.pc_id:
        try:
            pc = db.query(ClientPC).filter_by(id=cm.pc_id).first()
        except Exception:
            pc = None
        if pc:
            client_name = pc.name or f"PC-{pc.id}"
            if pc.current_user_id:
                # _CafeChatUser is CafeUser in MULTI_DB (queryable against the
                # cafe DB session) and legacy User in single-DB. Using the
                # legacy User class against the cafe DB used to silently
                # throw inside the try/except and leave user_name = "Guest".
                try:
                    user_obj = db.query(_CafeChatUser).filter_by(id=pc.current_user_id).first()
                except Exception:
                    user_obj = None
                if user_obj:
                    # Prefer full name if available, otherwise fallback to email
                    user_name = (
                        getattr(user_obj, "name", None)
                        or f"{getattr(user_obj, 'first_name', '')} {getattr(user_obj, 'last_name', '')}".strip()
                        or getattr(user_obj, "email", "")  # type: ignore[arg-type]
                        or "Guest"
                    )
    if not client_name and cm.pc_id:
        client_name = f"PC-{cm.pc_id}"

    # Customers can have role 'user', 'client', 'guest', 'member', etc.
    # Anything in the admin-side role set is treated as an admin sender.
    # Previously this only matched role == "client", which meant kiosk
    # customers (role "user") were tagged as "admin" — both directions
    # of the conversation showed up in the admin's panel as Admin, and
    # the kiosk widget couldn't tell its own messages from staff replies.
    role = getattr(current_user, "role", None)
    sender = "admin" if role in _ADMIN_ROLES else "client"
    recipient = "client" if sender == "admin" else "admin"

    # Broadcast real-time chat message via WebSockets with enriched payload
    ts = int(cm.timestamp.replace(tzinfo=UTC).timestamp())
    payload = {
        "message_id": str(cm.id),
        "client_id": cm.pc_id,
        "client_name": client_name,
        "user_name": user_name or ("Guest" if sender == "client" else "No user"),
        "text": cm.message,
        "from": sender,
        "to": recipient,
        "ts": ts,
    }
    envelope = build_event("chat.message", payload)
    json_envelope = json.dumps(envelope)

    # Resolve cafe_id for scoped broadcast
    _chat_cafe_id = None
    if cm.pc_id:
        try:
            _chat_pc = db.query(ClientPC).filter_by(id=cm.pc_id).first()
            if _chat_pc:
                _chat_cafe_id = _chat_pc.cafe_id
        except Exception:
            pass
    if _chat_cafe_id is None:
        _chat_cafe_id = getattr(current_user, "cafe_id", None)

    # Notify all admins scoped to cafe
    try:
        await ws_admin.broadcast_admin(json_envelope, cafe_id=_chat_cafe_id)
    except Exception:
        pass

    # Notify the specific PC client, if provided. Two channels:
    #   1) notify_pc — instant WebSocket push. The kiosk's
    #      PrimusWebSocketClient handles "chat.message" envelopes directly
    #      and routes them into the chat widget without a panel reopen.
    #   2) queue_device_event — fallback that materialises the event into
    #      the long-poll command queue, so a kiosk that has briefly lost
    #      its WS still catches the message on the next /api/command/pull.
    if cm.pc_id:
        try:
            await notify_pc(cm.pc_id, json_envelope)
        except Exception:
            pass
        try:
            queue_device_event(db, cm.pc_id, "chat.message", payload)
        except Exception:
            pass

    return cm


# Get my messages (latest first). Returns plain dicts (not ORM rows) so we
# can enrich each row with a `from` field that tells the client which side
# of the conversation sent it — admin or customer. Without this, the kiosk
# and the admin panel both had to infer sender role from heuristics that
# broke for customer-sent broadcasts (to_user_id null).
@router.get("/")
def my_messages(
    current_user=Depends(get_current_user),
    ctx: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    msgs = (
        scoped_query(db, ChatMessage, ctx)
        .filter((ChatMessage.to_user_id == current_user.id) | (ChatMessage.to_user_id.is_(None)))
        .order_by(ChatMessage.timestamp.desc())
        .all()
    )

    # Resolve from_user_id → role in one global-DB roundtrip. In multi-DB mode
    # users live only in the global DB so we can't join from chat_messages
    # (cafe DB) directly. We batch by ID to keep this O(1) per request.
    sender_ids = {m.from_user_id for m in msgs if m.from_user_id is not None}
    role_by_id: dict[int, str] = {}
    if sender_ids:
        global_db = global_session_factory()
        try:
            rows = (
                global_db.query(User.id, User.role)
                .filter(User.id.in_(sender_ids))
                .all()
            )
            role_by_id = {uid: (role or "") for uid, role in rows}
        finally:
            global_db.close()

    def _from_label(user_id: int | None) -> str:
        return "admin" if role_by_id.get(user_id or 0, "") in _ADMIN_ROLES else "client"

    def _utc_iso(dt):
        """Always emit a UTC-marked ISO string.

        The ChatMessage.timestamp column is `DateTime` (no tz) in the cafe
        schema, so SQLAlchemy returns it as naive even though it was
        written with `datetime.now(UTC)`. Without an explicit `+00:00`
        suffix, `new Date(s)` on the kiosk parses the string as local time
        (IST on the cafe kiosks) and the displayed time drifts by the local
        UTC offset — that was the root of the duplicate-bubble timezone bug.
        """
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt.isoformat()

    return [
        {
            "id": m.id,
            "from_user_id": m.from_user_id,
            "to_user_id": m.to_user_id,
            "pc_id": m.pc_id,
            "message": m.message,
            "timestamp": _utc_iso(m.timestamp),
            "read": m.read,
            "from": _from_label(m.from_user_id),
        }
        for m in msgs
    ]
