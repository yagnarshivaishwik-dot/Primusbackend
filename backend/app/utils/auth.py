import os

APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:8000")


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """
    Email functionality has been replaced with Gmail OTP system.
    Use the fastapi-mail implementation in otp_email.py instead.
    """
    pass


def build_email_verification_link(token: str) -> str:
    return f"{APP_BASE_URL}/api/auth/verify-email?token={token}"
