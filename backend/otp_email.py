import logging
import os
import random
import time
from typing import TypedDict

from dotenv import load_dotenv
from fastapi import BackgroundTasks
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import SecretStr

load_dotenv()
logger = logging.getLogger("primus.otp_email")

MAIL_USERNAME = os.getenv("MAIL_USERNAME") or ""
MAIL_PASSWORD = SecretStr(os.getenv("MAIL_PASSWORD") or "")
MAIL_FROM = os.getenv("MAIL_FROM") or ""
MAIL_PORT = int(os.getenv("MAIL_PORT") or "587")
MAIL_SERVER = os.getenv("MAIL_SERVER") or ""
MAIL_TLS = os.getenv("MAIL_TLS") == "True"
MAIL_SSL = os.getenv("MAIL_SSL") == "True"

# In local/dev environments where SMTP is not configured or credentials are invalid,
# we don't want OTP emails to crash requests. SUPPRESS_SEND tells fastapi-mail
# to skip actually connecting to SMTP; we also wrap send in a try/except below.
SUPPRESS_SEND = os.getenv("MAIL_SUPPRESS_SEND", "").lower() in {"1", "true", "yes"} or not (
    MAIL_USERNAME and MAIL_PASSWORD.get_secret_value() and MAIL_SERVER
)

conf = ConnectionConfig(
    MAIL_USERNAME=MAIL_USERNAME,
    MAIL_PASSWORD=MAIL_PASSWORD,
    MAIL_FROM=MAIL_FROM,
    MAIL_PORT=MAIL_PORT,
    MAIL_SERVER=MAIL_SERVER,
    MAIL_STARTTLS=MAIL_TLS,
    MAIL_SSL_TLS=MAIL_SSL,
    USE_CREDENTIALS=not SUPPRESS_SEND,
    SUPPRESS_SEND=SUPPRESS_SEND,
)


class OtpRecord(TypedDict):
    otp: str
    expires: float


otp_store: dict[str, OtpRecord] = {}


async def send_otp_email(email: str, background_tasks: BackgroundTasks):
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {"otp": otp, "expires": time.time() + 300}  # expires in 5 min

    message = MessageSchema(
        subject="Primus App Email Verification",
        recipients=[email],
        body=f'Hello, The OTP to verify your email and register your account is "{otp}"',
        subtype=MessageType.plain,
    )

    async def _safe_send(msg: MessageSchema) -> None:
        try:
            fm = FastMail(conf)
            await fm.send_message(msg)
        except Exception as exc:  # pragma: no cover - best-effort logging
            # Do not crash the request if SMTP is misconfigured; just log it.
            logger.warning("Failed to send OTP email to %s: %s", email, exc)

    background_tasks.add_task(_safe_send, message)

    return {"message": "OTP sent successfully"}


def verify_otp(email: str, provided_otp: str) -> bool:
    """Verify the OTP for a given email"""
    if email not in otp_store:
        return False

    stored_data = otp_store[email]
    current_time = time.time()

    # Check if OTP has expired
    if current_time > stored_data["expires"]:
        del otp_store[email]  # Clean up expired OTP
        return False

    # Check if OTP matches
    if stored_data["otp"] == provided_otp:
        del otp_store[email]  # Clean up used OTP
        return True

    return False
