"""
Public-facing compliance pages required by Cashfree (and most Indian
payment gateways) before they'll whitelist a domain for SDK use.

URLs (mounted at root, no /api prefix, fully public):
  GET /                  — landing/index linking to the policy pages
  GET /contact-us        — business contact info
  GET /terms             — Terms & Conditions
  GET /refunds           — Refunds & Cancellations
  GET /privacy-policy    — Privacy Policy
  GET /products          — products & services with INR pricing (from offers DB)

These pages exist solely to satisfy Cashfree's domain-whitelist
compliance check on api.primustech.in. The actual customer-facing
website (if one exists at the marketing domain) can override these
by being whitelisted instead — see PRIMUS_PUBLIC_API_URL.

Edit the BUSINESS_* constants below with your real registered details
before submitting the whitelist request. Phone, email, GST, and
address are the most important — Cashfree's reviewer reads these.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Iterable

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.dependencies import MULTI_DB_ENABLED, get_global_db


router = APIRouter()


# ── Edit these placeholders BEFORE submitting whitelist ───────────────
# All values can also be overridden by env vars at deploy time
# (PRIMUS_BUSINESS_NAME, PRIMUS_BUSINESS_EMAIL, ...).
BUSINESS_NAME = os.getenv(
    "PRIMUS_BUSINESS_NAME", "Primus Technologies"
)
BUSINESS_TAGLINE = os.getenv(
    "PRIMUS_BUSINESS_TAGLINE",
    "Gaming café management & kiosk payment platform",
)
BUSINESS_EMAIL = os.getenv(
    "PRIMUS_BUSINESS_EMAIL", "support@primustech.in"
)
BUSINESS_PHONE = os.getenv(
    "PRIMUS_BUSINESS_PHONE", "+91-XXXXXXXXXX"  # ← REPLACE before submit
)
BUSINESS_ADDRESS = os.getenv(
    "PRIMUS_BUSINESS_ADDRESS",
    "Hyderabad, Telangana, India",  # ← REPLACE with full registered address
)
BUSINESS_GSTIN = os.getenv(
    "PRIMUS_BUSINESS_GSTIN", ""
)  # ← OPTIONAL — fill if you want to display GSTIN on /contact-us
BUSINESS_HOURS = os.getenv(
    "PRIMUS_BUSINESS_HOURS",
    "Monday – Saturday, 10:00 – 19:00 IST",
)
BUSINESS_WEBSITE = os.getenv(
    "PRIMUS_BUSINESS_WEBSITE", "https://primustech.in"
)


# ── Shared chrome ─────────────────────────────────────────────────────

_CSS = """
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;background:#fafafa}
.wrap{max-width:780px;margin:0 auto;padding:48px 24px}
header{padding:24px 0;border-bottom:1px solid #e5e5e5;margin-bottom:32px}
header h1{font-size:26px;margin:0 0 4px;color:#0a0a0a}
header .tagline{color:#666;font-size:14px}
nav{margin-top:14px;font-size:14px}
nav a{color:#5b21b6;text-decoration:none;margin-right:18px}
nav a:hover{text-decoration:underline}
h2{font-size:24px;margin:32px 0 16px;color:#0a0a0a}
h3{font-size:17px;margin:24px 0 10px;color:#1a1a1a}
p,li{font-size:15px}
ul,ol{padding-left:22px}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:24px;margin:18px 0}
.kv{display:grid;grid-template-columns:170px 1fr;gap:8px 16px;margin:0}
.kv dt{font-weight:600;color:#444}
.kv dd{margin:0;color:#222}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #eee}
th{background:#f4f4f5;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#555}
td.price{font-weight:600;color:#0a0a0a;white-space:nowrap}
footer{margin-top:48px;padding-top:24px;border-top:1px solid #e5e5e5;color:#888;font-size:13px}
.muted{color:#666}
"""

# Same nav appears on every page so Cashfree's reviewer (and crawlers)
# can find each compliance page from any other.
_NAV = (
    '<nav>'
    '<a href="/">Home</a>'
    '<a href="/products">Products</a>'
    '<a href="/contact-us">Contact</a>'
    '<a href="/terms">Terms</a>'
    '<a href="/refunds">Refunds</a>'
    '<a href="/privacy-policy">Privacy</a>'
    '</nav>'
)


def _shell(title: str, body: str) -> HTMLResponse:
    """Render a page in the shared chrome with a permissive-but-safe CSP.

    These pages have inline <style> blocks which the default app CSP
    blocks. We override per-route — same pattern as the Cashfree
    launcher. No external scripts are loaded so this is still tight.
    """
    year = datetime.now().year
    html = (
        "<!doctype html><html lang=\"en\"><head>"
        "<meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<title>{title} · {BUSINESS_NAME}</title>"
        "<meta name=\"robots\" content=\"index,follow\">"
        f"<style>{_CSS}</style>"
        "</head><body>"
        "<div class=\"wrap\">"
        "<header>"
        f"<h1>{BUSINESS_NAME}</h1>"
        f"<div class=\"tagline\">{BUSINESS_TAGLINE}</div>"
        f"{_NAV}"
        "</header>"
        f"<main>{body}</main>"
        "<footer>"
        f"&copy; {year} {BUSINESS_NAME}. All rights reserved."
        f" &middot; <a href=\"{BUSINESS_WEBSITE}\">{BUSINESS_WEBSITE}</a>"
        "</footer>"
        "</div>"
        "</body></html>"
    )
    csp = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "script-src 'self'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return HTMLResponse(
        content=html,
        headers={"Content-Security-Policy": csp},
    )


# ── Routes ────────────────────────────────────────────────────────────


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def landing():
    body = (
        "<h2>Welcome to " + BUSINESS_NAME + "</h2>"
        "<p>" + BUSINESS_TAGLINE + ".</p>"
        "<p>This site hosts the API and policy documents for the Primus "
        "kiosk payment platform used by partner gaming cafés across India.</p>"
        "<div class=\"card\">"
        "<h3>Quick links</h3>"
        "<ul>"
        "<li><a href=\"/products\">Products &amp; services (with pricing)</a></li>"
        "<li><a href=\"/contact-us\">Contact us</a></li>"
        "<li><a href=\"/terms\">Terms &amp; conditions</a></li>"
        "<li><a href=\"/refunds\">Refunds &amp; cancellations</a></li>"
        "<li><a href=\"/privacy-policy\">Privacy policy</a></li>"
        "</ul>"
        "</div>"
    )
    return _shell("Home", body)


@router.get("/contact-us", response_class=HTMLResponse, include_in_schema=False)
async def contact_us():
    rows = [
        ("Business name", BUSINESS_NAME),
        ("Email", f'<a href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a>'),
        ("Phone", BUSINESS_PHONE),
        ("Registered address", BUSINESS_ADDRESS),
        ("Operating hours", BUSINESS_HOURS),
    ]
    if BUSINESS_GSTIN:
        rows.append(("GSTIN", BUSINESS_GSTIN))

    items = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows)

    body = (
        "<h2>Contact us</h2>"
        "<p>Reach the Primus support team using any of the channels below. "
        "We respond to all inquiries within one business day.</p>"
        "<div class=\"card\"><dl class=\"kv\">"
        f"{items}"
        "</dl></div>"
        "<h3>For café operators</h3>"
        "<p>If you operate a café running Primus and need support with kiosk "
        "registration, payment reconciliation, or hardware issues, please "
        f"email <a href=\"mailto:{BUSINESS_EMAIL}\">{BUSINESS_EMAIL}</a> "
        "with your café ID and a description of the issue.</p>"
        "<h3>For payment-related queries</h3>"
        "<p>Refund and chargeback queries are handled per the policy on the "
        "<a href=\"/refunds\">refunds page</a>. For unrecognised "
        "transactions please include the order reference (begins with "
        "<code>PRIMUS_</code>) and the date.</p>"
    )
    return _shell("Contact us", body)


@router.get("/terms", response_class=HTMLResponse, include_in_schema=False)
async def terms():
    body = (
        "<h2>Terms &amp; conditions</h2>"
        f"<p class=\"muted\">Last updated: {datetime.now().strftime('%d %B %Y')}</p>"
        "<p>These terms govern your use of the Primus kiosk platform "
        "operated by " + BUSINESS_NAME + ". By using the kiosk app or "
        "purchasing time packages through it, you agree to these terms.</p>"

        "<h3>1. Services</h3>"
        "<p>Primus operates a self-service kiosk platform that lets gaming café "
        "customers purchase prepaid time packages, top up wallet balance, and "
        "manage their gaming session. Time packages are delivered as minutes "
        "credited to the user's account on the café's PCs.</p>"

        "<h3>2. Eligibility</h3>"
        "<p>You must be at least 13 years old to create an account. Users "
        "under 18 must have parental consent to make purchases.</p>"

        "<h3>3. Payments</h3>"
        "<p>All payments are processed in Indian Rupees (INR) through our "
        "payment partner Cashfree Payments India Pvt Ltd. Time-package "
        "credit is added to the user's account once the payment is "
        "confirmed by Cashfree (typically within seconds).</p>"

        "<h3>4. User obligations</h3>"
        "<ul>"
        "<li>Provide accurate registration information.</li>"
        "<li>Keep your login credentials confidential.</li>"
        "<li>Do not attempt to reverse-engineer or tamper with the kiosk software.</li>"
        "<li>Comply with the operating café's house rules.</li>"
        "</ul>"

        "<h3>5. Service availability</h3>"
        "<p>We aim to keep the platform available 24×7 but cannot guarantee "
        "uninterrupted service. Scheduled maintenance windows will be "
        "communicated to operators via the admin dashboard.</p>"

        "<h3>6. Limitation of liability</h3>"
        "<p>Primus's liability for any single user is capped at the amount "
        "the user has paid in the 30 days preceding the claim. We are not "
        "liable for indirect or consequential losses.</p>"

        "<h3>7. Governing law</h3>"
        "<p>These terms are governed by the laws of India and disputes are "
        "subject to the exclusive jurisdiction of the courts at Hyderabad, "
        "Telangana.</p>"

        "<h3>8. Changes</h3>"
        "<p>We may update these terms; the &ldquo;last updated&rdquo; date "
        "above reflects the latest revision. Continued use of the platform "
        "after changes constitutes acceptance.</p>"

        "<h3>9. Contact</h3>"
        f"<p>Questions about these terms? Email "
        f"<a href=\"mailto:{BUSINESS_EMAIL}\">{BUSINESS_EMAIL}</a>.</p>"
    )
    return _shell("Terms & conditions", body)


@router.get("/refunds", response_class=HTMLResponse, include_in_schema=False)
async def refunds():
    body = (
        "<h2>Refunds &amp; cancellations</h2>"
        f"<p class=\"muted\">Last updated: {datetime.now().strftime('%d %B %Y')}</p>"

        "<h3>Time-package purchases</h3>"
        "<p>Time packages are credited to your account immediately on "
        "successful payment. Once minutes have been used, that portion is "
        "non-refundable. Unused minutes can be refunded under the conditions "
        "below.</p>"

        "<h3>Eligible refund scenarios</h3>"
        "<ul>"
        "<li><strong>Failed payment with debit:</strong> If your bank debited "
        "the amount but the kiosk did not credit minutes, the funds are "
        "refunded automatically by our payment partner within 5–7 business "
        "days. No action needed from you.</li>"
        "<li><strong>Duplicate charge:</strong> If you were charged twice for "
        "the same package, contact us with both order references and we will "
        "refund the duplicate within 3 business days.</li>"
        "<li><strong>Service outage:</strong> If the platform was unusable "
        "due to a Primus-side outage during the validity of your package, "
        "we will refund the affected portion on request.</li>"
        "<li><strong>Unused minutes (goodwill):</strong> Refunds for unused "
        "minutes purchased within the past 7 days are at the operating "
        "café's discretion.</li>"
        "</ul>"

        "<h3>How to request a refund</h3>"
        "<ol>"
        f"<li>Email <a href=\"mailto:{BUSINESS_EMAIL}\">{BUSINESS_EMAIL}</a> "
        "with subject <em>&ldquo;Refund request &mdash; PRIMUS_&lt;order id&gt;&rdquo;</em>.</li>"
        "<li>Include the order reference (visible on the kiosk after "
        "purchase, format <code>PRIMUS_XXXXXXXXXXXXXXXX</code>) and a brief "
        "description of the issue.</li>"
        "<li>We respond within 1 business day with the refund status.</li>"
        "</ol>"

        "<h3>Refund timeline</h3>"
        "<p>Approved refunds are processed via the original payment method "
        "(UPI, card, netbanking, or wallet). The amount typically reflects "
        "in your account within 5–7 business days, depending on your bank.</p>"

        "<h3>Cancellations</h3>"
        "<p>An active gaming session cannot be cancelled mid-way. To stop "
        "consuming minutes, log out at the kiosk &mdash; remaining minutes "
        "stay on your account for future use.</p>"

        "<h3>Contact</h3>"
        f"<p>For all refund queries: "
        f"<a href=\"mailto:{BUSINESS_EMAIL}\">{BUSINESS_EMAIL}</a> &middot; "
        f"{BUSINESS_PHONE}.</p>"
    )
    return _shell("Refunds & cancellations", body)


@router.get("/privacy-policy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    body = (
        "<h2>Privacy policy</h2>"
        f"<p class=\"muted\">Last updated: {datetime.now().strftime('%d %B %Y')}</p>"

        "<p>This policy explains what data " + BUSINESS_NAME + " collects "
        "when you use the Primus kiosk app and how we use it.</p>"

        "<h3>Information we collect</h3>"
        "<ul>"
        "<li><strong>Account info:</strong> name, email, phone, and password "
        "(stored as a one-way hash).</li>"
        "<li><strong>Usage data:</strong> kiosk session times, packages "
        "purchased, games launched, wallet balance.</li>"
        "<li><strong>Payment metadata:</strong> order IDs, payment status, "
        "and amounts. We <em>do not</em> see or store full card numbers, CVVs, "
        "UPI PINs, or banking credentials &mdash; those are handled "
        "exclusively by Cashfree.</li>"
        "<li><strong>Device data:</strong> the registered kiosk PC's "
        "hardware fingerprint and license key, used solely to bind a kiosk "
        "to a café.</li>"
        "</ul>"

        "<h3>How we use it</h3>"
        "<ul>"
        "<li>Operate the kiosk service and apply the time you purchased.</li>"
        "<li>Issue receipts and reconcile payments with our payment partner.</li>"
        "<li>Diagnose technical issues and prevent fraud.</li>"
        "<li>Send transactional emails (password reset, payment confirmations).</li>"
        "</ul>"
        "<p>We do <strong>not</strong> sell your data and do not run "
        "third-party advertising on the kiosk.</p>"

        "<h3>Data retention</h3>"
        "<p>Account and transaction records are retained for 7 years to "
        "comply with Indian tax and audit regulations. You may request "
        "account deletion (subject to retention rules) by emailing us.</p>"

        "<h3>Sharing</h3>"
        "<p>We share data with our payment partner Cashfree (for processing "
        "payments) and with the operating café (for serving you on-site). "
        "We do not share with anyone else except where required by law.</p>"

        "<h3>Your rights</h3>"
        "<ul>"
        "<li>Access a copy of your data.</li>"
        "<li>Correct inaccurate data.</li>"
        "<li>Request deletion (subject to legal retention).</li>"
        "</ul>"
        "<p>Email "
        f"<a href=\"mailto:{BUSINESS_EMAIL}\">{BUSINESS_EMAIL}</a> "
        "to exercise any of these rights.</p>"

        "<h3>Security</h3>"
        "<p>Passwords are stored as bcrypt hashes. Device-level secrets are "
        "encrypted with Windows DPAPI on the kiosk. All API traffic is "
        "served over HTTPS. Webhooks are HMAC-signed.</p>"
    )
    return _shell("Privacy policy", body)


@router.get("/products", response_class=HTMLResponse, include_in_schema=False)
async def products(db: Session = Depends(get_global_db)):
    """List the time packages we sell with INR pricing.

    In multi-DB mode each café has its own offers table; we list the
    most-recent active offers across cafés so reviewers see real
    pricing. In single-DB mode the global offers table is used.
    Failures fall back to a static description so the page never
    fails to render.
    """
    rows: list[tuple[str, str, str]] = []  # (name, duration, price)
    try:
        from sqlalchemy import text

        if MULTI_DB_ENABLED:
            from app.db.router import cafe_db_router
            with db.begin():
                cafe_ids_rows = db.execute(text("SELECT id FROM cafes ORDER BY id LIMIT 5")).all()
            cafe_ids = [int(r[0]) for r in cafe_ids_rows]

            seen: set[str] = set()
            for cid in cafe_ids:
                try:
                    eng = cafe_db_router.get_engine(cid)
                    with eng.connect() as conn:
                        offers = conn.execute(text(
                            "SELECT name, hours_minutes, price FROM offers "
                            "WHERE active = TRUE ORDER BY display_order, id LIMIT 8"
                        )).all()
                    for n, m, p in offers:
                        key = (str(n), int(m or 0))
                        if key in seen:
                            continue
                        seen.add(key)
                        rows.append((str(n), _fmt_duration(int(m or 0)), _fmt_price(float(p or 0))))
                        if len(rows) >= 12:
                            break
                except Exception:
                    continue
                if len(rows) >= 12:
                    break
        else:
            with db.begin():
                offers = db.execute(text(
                    "SELECT name, hours_minutes, price FROM offers "
                    "WHERE active = TRUE ORDER BY display_order, id LIMIT 12"
                )).all()
            for n, m, p in offers:
                rows.append((str(n), _fmt_duration(int(m or 0)), _fmt_price(float(p or 0))))
    except Exception:
        rows = []

    if rows:
        table_rows = "".join(
            f"<tr><td>{name}</td><td>{dur}</td><td class=\"price\">{price}</td></tr>"
            for name, dur, price in rows
        )
        table_html = (
            "<table>"
            "<thead><tr><th>Package</th><th>Duration</th><th>Price (INR)</th></tr></thead>"
            f"<tbody>{table_rows}</tbody>"
            "</table>"
        )
    else:
        # Fallback when no offers are live yet.
        table_html = (
            "<div class=\"card\">"
            "<p>Time packages are configured per café. Typical pricing:</p>"
            "<table>"
            "<thead><tr><th>Package</th><th>Duration</th><th>Price (INR)</th></tr></thead>"
            "<tbody>"
            "<tr><td>Quick Spin</td><td>30 minutes</td><td class=\"price\">&#8377;30</td></tr>"
            "<tr><td>Hourly Pack</td><td>60 minutes</td><td class=\"price\">&#8377;60</td></tr>"
            "<tr><td>Power Hour</td><td>120 minutes</td><td class=\"price\">&#8377;110</td></tr>"
            "<tr><td>Weekend Special</td><td>240 minutes</td><td class=\"price\">&#8377;200</td></tr>"
            "</tbody>"
            "</table>"
            "<p class=\"muted\">Final pricing is set by the operating "
            "café and shown in the kiosk shop before purchase.</p>"
            "</div>"
        )

    body = (
        "<h2>Products &amp; services</h2>"
        "<p>Primus sells <strong>prepaid gaming-time packages</strong> through "
        "self-service kiosks operated by partner café establishments. All "
        "prices are in Indian Rupees (INR) and inclusive of applicable GST "
        "where displayed.</p>"
        f"{table_html}"
        "<h3>How to purchase</h3>"
        "<ol>"
        "<li>Walk up to a Primus kiosk at any partner café.</li>"
        "<li>Sign in with your Primus account (or register on the spot).</li>"
        "<li>Pick a package, add to cart, and tap <em>Pay with UPI</em>.</li>"
        "<li>Complete the payment on the secure Cashfree screen.</li>"
        "<li>Minutes are credited instantly &mdash; start playing.</li>"
        "</ol>"
        "<p class=\"muted\">For an enterprise café-management plan or "
        f"partnership inquiries, email <a href=\"mailto:{BUSINESS_EMAIL}\">"
        f"{BUSINESS_EMAIL}</a>.</p>"
    )
    return _shell("Products & services", body)


# ── Helpers ───────────────────────────────────────────────────────────


def _fmt_duration(minutes: int) -> str:
    if minutes <= 0:
        return "—"
    if minutes < 60:
        return f"{minutes} minutes"
    hours = minutes // 60
    rem = minutes % 60
    if rem == 0:
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    return f"{hours}h {rem}m"


def _fmt_price(amount: float) -> str:
    # Indian Rupee symbol + comma grouping
    return f"₹{int(amount):,}" if amount == int(amount) else f"₹{amount:,.2f}"
