import os

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

CONTENT = [
    ("Lance / Primus Platform - Comprehensive Brief", True),
    ("", False),
    ("Overview", True),
    (
        "Lance/Primus is an end-to-end cafe and PC-lab management platform combining a Python FastAPI backend, React admin frontends, and a Windows C# WPF client to control PCs.",
        False,
    ),
    ("", False),
    ("Core Components", True),
    (
        "- Backend API (Python/FastAPI): central service exposing REST and WebSockets; SQLite via SQLAlchemy.",
        False,
    ),
    (
        "- Admin Web UIs (React/Vite): `admin-app` and `Primus/primus-client` for staff/admin operations.",
        False,
    ),
    (
        "- Windows Client (Primus-client.exe): C# .NET 8 WPF app that binds to a PC, receives commands, and enforces locks.",
        False,
    ),
    ("", False),
    ("Authentication & Authorization", True),
    ("- Email/password login issues JWTs at /api/auth/login.", False),
    ("- JWT carries role and cafe_id claims; guards endpoints via dependencies.", False),
    ("- Roles: client, staff, admin. Fine-grained checks via require_role().", False),
    ("- Email verification and password reset flows optionally available via SMTP.", False),
    (
        "- Firebase Admin SDK is supported for token verification but email/password JWT is primary.",
        False,
    ),
    ("", False),
    ("PC Management & Sessions", True),
    ("- Bind/register client PCs to cafes and groups; track current_user on each PC.", False),
    (
        "- Start/stop sessions; compute time remaining from wallet, offers, and pricing rules.",
        False,
    ),
    (
        "- Auto time-left broadcast every minute and auto-lock at zero minutes (background task).",
        False,
    ),
    ("- Lock/unlock and remote commands sent over WebSocket /ws/pc/{pc_id}.", False),
    ("", False),
    ("Realtime & Admin Broadcast", True),
    ("- PC WebSocket: /ws/pc/{pc_id} for targeted commands and hints.", False),
    ("- Admin WebSocket: /ws/admin to broadcast messages to connected admins.", False),
    ("", False),
    ("Commerce: Wallet, Offers, Coupons, Payments", True),
    (
        "- Wallet: maintain wallet_balance and coins_balance; convert to time via active pricing rules.",
        False,
    ),
    ("- Offers & Coupons: grant hours/discounts; user offers are consumed as time.", False),
    (
        "- Payments & Billing: record payments and invoices; integrate with external providers via webhooks.",
        False,
    ),
    ("", False),
    ("Content & Engagement", True),
    ("- Games catalog with min_age and metadata.", False),
    ("- Events, prizes, and leaderboards for engagement and competitions.", False),
    ("- Announcements and notifications to users and staff.", False),
    ("- Chat and support tickets for messaging and helpdesk.", False),
    ("", False),
    ("Operations & Admin Tools", True),
    ("- Remote commands to client PCs; lock/unlock, run tasks, maintenance.", False),
    ("- Screenshots: capture screenshots from client PCs for supervision.", False),
    ("- Hardware inventory and status reporting.", False),
    ("- Cafe configuration, staff management, and user groups with discounts.", False),
    ("- PC groups and bans; restrict access by machine or group.", False),
    ("- Backup and restore of data; audit logging of sensitive actions.", False),
    ("- Stats and reports for usage, revenue, and operational metrics.", False),
    ("", False),
    ("Feature Map (by API modules)", True),
    ("- auth: register, login (JWT), profile, password reset.", False),
    ("- pc: register/bind PCs, control state, metadata.", False),
    ("- session: session lifecycle, time accounting.", False),
    ("- wallet: balance CRUD/top-ups; conversion to time.", False),
    ("- game: games catalog CRUD; age-rating.", False),
    ("- remote_command: run remote operations on PCs.", False),
    ("- stats: usage and financial metrics.", False),
    ("- chat, notification: messaging and push notifications.", False),
    ("- support_ticket: helpdesk flows.", False),
    ("- announcement: system announcements.", False),
    ("- hardware: inventory/telemetry endpoints.", False),
    ("- update: client update/versioning hooks.", False),
    ("- license: licensing and entitlement checks.", False),
    ("- audit: audit trails for admin-sensitive actions.", False),
    ("- pc_ban, pc_group: access control at machine/group level.", False),
    ("- backup: DB backup/restore endpoints.", False),
    ("- billing, payment: invoices, transactions, providers.", False),
    ("- webhook: provider callbacks.", False),
    ("- social_auth: OAuth/Social login integration.", False),
    ("- membership: memberships/tiers.", False),
    ("- booking: seat/PC booking and reservations.", False),
    ("- screenshot: capture images from clients.", False),
    ("- pc_admin: advanced PC admin functions.", False),
    ("- cafe: cafe-level configuration and policies.", False),
    ("- clientpc: client PC-side API interactions.", False),
    ("- staff: staff management and roles.", False),
    ("- offer, coupon: discounts and time offers.", False),
    ("- user_group: role-based grouping and discounts.", False),
    ("- prize, leaderboard, event: engagement & competitions.", False),
    ("", False),
    ("Data Model Highlights", True),
    ("- Users: role, wallet_balance, coins_balance, user_group_id, email verification.", False),
    ("- ClientPC: bound flag, device_id, current_user_id, grace and suspension.", False),
    ("- PricingRule: rate_per_hour and schedule; discounted by UserGroup.", False),
    ("- UserOffer: hours_remaining; consumed before wallet.", False),
    ("", False),
    ("Background Processing", True),
    ("- A periodic job computes minutes remaining per PC and pushes /ws/pc events.", False),
    ("- Sends warnings at 5 and 1 minutes; locks PC at 0 minutes.", False),
    ("", False),
    ("Windows Client (C# WPF)", True),
    (
        "- Built with .NET 8 WPF; connects to /ws/pc/{pc_id}; enforces lock/unlock and updates.",
        False,
    ),
    ("- Deployed via Inno Setup installer (installer/PrimusClient.iss).", False),
    ("", False),
    ("Admin Web Apps (React/Vite)", True),
    ("- `admin-app`: React 19 + Vite; manages authentication and admin operations.", False),
    ("- `Primus/primus-client`: React 19 + Tailwind + Vite; admin/client UI.", False),
    ("", False),
    ("Configuration & Environment", True),
    ("- .env: SECRET_KEY, SMTP_*, APP_BASE_URL, FIREBASE_CREDENTIALS_JSON, etc.", False),
    ("- CORS enabled for development; restrict origins in production.", False),
    ("", False),
    ("Deployment", True),
    ("- Backend: uvicorn main:app --host 0.0.0.0 --port 8000 (see backend/main.py).", False),
    ("- Frontend: npm run build; host the dist/ folder behind a web server.", False),
    ("- Windows client: build and install on lab PCs; auto-start recommended.", False),
    ("", False),
    ("Security Practices", True),
    ("- Store hashed passwords (bcrypt); sign JWTs with SECRET_KEY.", False),
    ("- Use role checks on admin endpoints; audit sensitive actions.", False),
    ("- Configure CORS and HTTPS in production; rotate credentials.", False),
    ("", False),
    ("Extensibility", True),
    ("- Webhook endpoints for integrations; modular API routers per domain.", False),
    ("- React frontends can be extended with additional views and charts.", False),
]


def draw_wrapped_text(c, text, x, y, max_width, bold=False, leading=14):
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_name = "Helvetica-Bold" if bold else "Helvetica"
    font_size = 11 if not bold else 13
    c.setFont(font_name, font_size)
    words = text.split()
    line = ""
    for word in words:
        test_line = (line + " " + word).strip()
        if stringWidth(test_line, font_name, font_size) <= max_width:
            line = test_line
        else:
            c.drawString(x, y, line)
            y -= leading
            line = word
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def generate_pdf(output_path: str):
    c = canvas.Canvas(output_path, pagesize=LETTER)
    width, height = LETTER
    left_margin = 0.9 * inch
    right_margin = 0.9 * inch
    top_margin = 0.9 * inch
    y = height - top_margin
    max_width = width - left_margin - right_margin

    for text, is_heading in CONTENT:
        if y < 1.0 * inch:
            c.showPage()
            y = height - top_margin
        if text:
            y = draw_wrapped_text(
                c,
                text,
                left_margin,
                y,
                max_width,
                bold=is_heading,
                leading=16 if is_heading else 14,
            )
        else:
            y -= 6

    c.save()


if __name__ == "__main__":
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))
    out_path = os.path.join(root, "Lance-App-Brief.pdf")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    generate_pdf(out_path)
    print(f"Wrote {out_path}")
