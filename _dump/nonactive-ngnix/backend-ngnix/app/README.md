# Lance Backend

## Email Verification Setup

Set these environment variables before running the server:

- `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (optional)
- `APP_BASE_URL` (e.g., http://localhost:8000)

Endpoints:

- `POST /api/auth/register` — sends verification email
- `GET /api/auth/verify-email?token=...` — marks email verified
- `POST /api/auth/verify-email/resend` — body `{ "email": "..." }`

Password login is blocked until `is_email_verified` is true. Social logins auto-verify email.

