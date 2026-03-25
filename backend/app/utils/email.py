import logging
import os

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import EmailStr, SecretStr

logger = logging.getLogger("primus.email")

MAIL_USERNAME = os.getenv("MAIL_USERNAME") or ""
MAIL_PASSWORD = SecretStr(os.getenv("MAIL_PASSWORD") or "")
MAIL_FROM = os.getenv("MAIL_FROM") or "support@primusadmin.in"
MAIL_PORT = int(os.getenv("MAIL_PORT") or "587")
MAIL_SERVER = os.getenv("MAIL_SERVER") or "smtp.gmail.com"
MAIL_TLS = os.getenv("MAIL_TLS", "True") == "True"
MAIL_SSL = os.getenv("MAIL_SSL", "False") == "True"

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


async def send_email(
    recipients: list[EmailStr], subject: str, body: str, subtype: MessageType = MessageType.html
):
    message = MessageSchema(
        subject=subject,
        recipients=recipients,
        body=body,
        subtype=subtype,
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def send_welcome_email(email: str, name: str, username: str, password: str):
    subject = "Welcome to Primus — Your Cafe Is Ready"
    body = f"""
    <html>
        <body>
        <h2>Welcome to Primus, {name}!</h2>
        <p>Your cafe management system is ready for use. Primus provides centralized control, real-time monitoring, and unmatched reliability for your gaming center.</p>

        <h3>Trial Information</h3>
        <p>You have been granted a <b>30-day trial</b> with no commitment. Your trial period starts from your first successful login.</p>

        <h3>Your Credentials</h3>
        <p>
            <b>Admin Portal:</b> <a href="https://primusadmin.in">https://primusadmin.in</a><br>
            <b>Username:</b> {username}<br>
            <b>Temporary Password:</b> {password}
        </p>

        <p><i>Note: Please change your password after your first login.</i></p>

        <hr>
        <p>If you have any questions, feel free to contact our support team at support@primusadmin.in</p>
            <p>Best regards,<br>The Primus Team</p>
        </body>
    </html>
    """
    return await send_email([email], subject, body)
