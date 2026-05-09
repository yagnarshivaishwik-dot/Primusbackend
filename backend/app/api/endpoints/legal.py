"""
Public-facing compliance and brand site for the Primus platform.

Why this exists:
  Cashfree (and every Indian payment gateway) requires the merchant's
  domain to host real Contact / Terms / Refunds / Privacy / Products
  pages BEFORE they'll whitelist it for SDK use. These pages also
  serve as the public face of api.primustech.in for anyone landing
  there directly.

URLs (mounted at root, no /api prefix, fully public):
  GET /                    — landing
  GET /about-us            — mission, story, what we do
  GET /products            — curated time-package catalogue with INR pricing
  GET /contact-us          — business contact info + grievance officer
  GET /terms               — Terms & Conditions
  GET /refunds             — Refunds & Cancellations
  GET /privacy-policy      — Privacy Policy (DPDP Act 2023 compliant)

Design direction: dark-luxury × retro-futurist arcade.
  - Midnight-navy base, magenta→violet→cyan gradient accents
  - Playfair Display (display) × Inter (body) typography pairing
  - Asymmetric hero, layered depth, scroll-revealed sections
  - Production-grade, mobile-first, accessibility-aware

Customisation:
  Edit BUSINESS_* constants below, OR override at deploy time via
  PRIMUS_BUSINESS_* env vars. The phone placeholder must be replaced
  before submitting the Cashfree whitelist.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Iterable

from fastapi import APIRouter
from fastapi.responses import HTMLResponse


router = APIRouter()


# ── Edit before submitting whitelist (or override via env) ───────────

# Public-facing brand (the "Primus" name users see).
BUSINESS_NAME = os.getenv("PRIMUS_BUSINESS_NAME", "Primus Infotech")
BUSINESS_TAGLINE = os.getenv(
    "PRIMUS_BUSINESS_TAGLINE",
    "Self-service kiosks, dynamic inventory, and instant payments for India's gaming cafés.",
)
BUSINESS_EMAIL = os.getenv("PRIMUS_BUSINESS_EMAIL", "support@primusadmin.in")
BUSINESS_PHONE = os.getenv("PRIMUS_BUSINESS_PHONE", "+91-9392777989")
BUSINESS_ADDRESS = os.getenv(
    "PRIMUS_BUSINESS_ADDRESS",
    "4th Floor, Block 3, Hitech City Rd, Patrika Nagar, Madhapur, Hyderabad, Telangana 500081",
)
BUSINESS_CITY = os.getenv("PRIMUS_BUSINESS_CITY", "Hyderabad")
BUSINESS_GSTIN = os.getenv("PRIMUS_BUSINESS_GSTIN", "")  # optional
BUSINESS_HOURS = os.getenv(
    "PRIMUS_BUSINESS_HOURS",
    "Monday – Saturday · 10:00 – 19:00 IST",
)
BUSINESS_WEBSITE = os.getenv("PRIMUS_BUSINESS_WEBSITE", "https://primustech.in")
GRIEVANCE_OFFICER_NAME = os.getenv("PRIMUS_GRIEVANCE_NAME", "Grievance Officer")
GRIEVANCE_OFFICER_EMAIL = os.getenv(
    "PRIMUS_GRIEVANCE_EMAIL", "support@primusadmin.in"
)

# Legal entity that holds the Cashfree merchant account (KYC). Cashfree's
# reviewer will cross-check the website against this exact name + CIN +
# registered address — they MUST match what's on file. "Primus" is the
# operating brand of this entity.
LEGAL_ENTITY_NAME = os.getenv(
    "PRIMUS_LEGAL_ENTITY", "HYDRAS SPORTS NETWORK PRIVATE LIMITED"
)
LEGAL_ENTITY_TYPE = os.getenv(
    "PRIMUS_LEGAL_ENTITY_TYPE", "Private Limited Company"
)
LEGAL_ENTITY_CIN = os.getenv(
    "PRIMUS_LEGAL_ENTITY_CIN", "U92490TG2021PTC150427"
)
LEGAL_ENTITY_ADDRESS = os.getenv(
    "PRIMUS_LEGAL_ENTITY_ADDRESS",
    "10-3-782, 253/3RT, Vijay Nagar Colony, Hyderabad, Telangana, India - 500057",
)
LEGAL_ENTITY_DESCRIPTION = os.getenv(
    "PRIMUS_LEGAL_ENTITY_DESCRIPTION",
    "HYDRAS SPORTS NETWORK PRIVATE LIMITED is a digital entertainment and esports "
    "company focused on building and scaling the gaming ecosystem in India. "
    "The company operates across competitive esports, creator growth, and digital "
    "content infrastructure — including talent management, influencer marketing, "
    "content production, monetization solutions for creators and gaming communities, "
    "and technology platforms that power campus esports programs, gaming cafés, "
    "and digital media properties.",
)


# ── Curated product catalogue (NOT pulled from DB — keeps the public ─
#    site decent regardless of what test data is in the offers tables) ─

PACKAGES: list[dict] = [
    {
        "name": "Quick Spin",
        "minutes": 30,
        "bonus": 0,
        "price": 49,
        "tag": None,
        "blurb": "Drop in, play a round, head out.",
    },
    {
        "name": "Hourly Pack",
        "minutes": 60,
        "bonus": 0,
        "price": 89,
        "tag": "Most popular",
        "blurb": "The classic hour. Enough for a ranked match or a campaign mission.",
    },
    {
        "name": "Power Hour",
        "minutes": 90,
        "bonus": 10,
        "price": 129,
        "tag": None,
        "blurb": "An hour and a half plus a bonus 10 minutes on the house.",
    },
    {
        "name": "Mega Combo",
        "minutes": 180,
        "bonus": 30,
        "price": 229,
        "tag": "Best value",
        "blurb": "Three hours, plus 30 free. The pack squad players quietly love.",
    },
    {
        "name": "Weekend Warrior",
        "minutes": 240,
        "bonus": 30,
        "price": 299,
        "tag": None,
        "blurb": "Built for Saturday-night ladders. Four hours plus a half-hour bonus.",
    },
    {
        "name": "Marathon Pack",
        "minutes": 480,
        "bonus": 60,
        "price": 549,
        "tag": None,
        "blurb": "Eight uninterrupted hours plus a free hour. Bring snacks.",
    },
    {
        "name": "Tournament Pass",
        "minutes": 600,
        "bonus": 120,
        "price": 699,
        "tag": "Pro",
        "blurb": "Ten hours plus two free. The package every café tournament runs on.",
    },
]


# ── Design system ────────────────────────────────────────────────────

_FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" '
    'href="https://fonts.googleapis.com/css2?'
    'family=Playfair+Display:ital,wght@0,500;0,700;0,800;1,500;1,800&'
    'family=Inter:wght@400;500;600;700&'
    'family=JetBrains+Mono:wght@400;500&display=swap">'
)

_CSS = """
:root{
  --bg-0:#06080F;
  --bg-1:#0A0E1F;
  --bg-2:#0F1428;
  --surface:#0E1326;
  --surface-2:#141a35;
  --border:rgba(140,150,200,0.10);
  --border-strong:rgba(140,150,200,0.22);
  --text:#ECEFF6;
  --text-dim:#A8B0C9;
  --text-muted:#7A839E;
  --accent-1:#FF2D6F;
  --accent-2:#8B5CF6;
  --accent-3:#00E5FF;
  --grad: linear-gradient(120deg,var(--accent-1) 0%,var(--accent-2) 50%,var(--accent-3) 100%);
  --grad-dim: linear-gradient(120deg,rgba(255,45,111,.18),rgba(139,92,246,.18) 50%,rgba(0,229,255,.18));
  --shadow-1: 0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 60px -30px rgba(0,0,0,0.7);
  --shadow-2: 0 24px 60px -24px rgba(139,92,246,0.35);
  --r-sm:8px;--r-md:14px;--r-lg:22px;--r-xl:34px;
  --t-fast:160ms;--t-med:320ms;--t-slow:520ms;
  --ease: cubic-bezier(.16,1,.3,1);
}

*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{
  margin:0;
  background:
    radial-gradient(1100px 600px at 80% -10%, rgba(139,92,246,.18), transparent 60%),
    radial-gradient(900px 500px at -10% 30%, rgba(0,229,255,.10), transparent 55%),
    linear-gradient(180deg,var(--bg-0) 0%,var(--bg-1) 100%);
  background-attachment: fixed;
  color:var(--text);
  font-family:'Inter',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  font-size:16px;line-height:1.65;
  letter-spacing:-0.005em;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  min-height:100vh;
  overflow-x:hidden;
}
body::before{
  content:'';position:fixed;inset:0;pointer-events:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity:.4;mix-blend-mode:overlay;z-index:0;
}
a{color:inherit;text-decoration:none;transition:color var(--t-fast) var(--ease)}
a.link{color:#C8D0EE;border-bottom:1px solid rgba(200,208,238,.25);padding-bottom:1px}
a.link:hover{color:#fff;border-bottom-color:#fff}

/* ── nav ── */
.nav{
  position:sticky;top:0;z-index:50;
  backdrop-filter:saturate(160%) blur(14px);
  -webkit-backdrop-filter:saturate(160%) blur(14px);
  background:rgba(6,8,15,0.66);
  border-bottom:1px solid var(--border);
}
.nav-inner{
  max-width:1180px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 28px;
}
.brand{display:flex;align-items:center;gap:14px;font-family:'Playfair Display',serif;font-weight:800;font-size:22px;letter-spacing:-0.01em}
.brand-mark{
  width:34px;height:34px;border-radius:10px;flex:none;
  background:var(--grad);
  box-shadow:0 0 0 1px rgba(255,255,255,.08), 0 8px 22px -6px rgba(139,92,246,.55);
  position:relative;
}
.brand-mark::after{
  content:'';position:absolute;inset:7px;border-radius:5px;
  background:rgba(8,10,20,.85);
}
.brand-mark::before{
  content:'';position:absolute;inset:11px;border-radius:3px;
  background:var(--grad);
}
.nav-links{display:flex;gap:30px;align-items:center;font-size:14px;color:var(--text-dim)}
.nav-links a{position:relative;padding:6px 0}
.nav-links a:hover{color:#fff}
.nav-links a.active{color:#fff}
.nav-links a.active::after{
  content:'';position:absolute;left:0;right:0;bottom:-2px;height:2px;
  background:var(--grad);border-radius:2px;
}
@media (max-width:760px){
  .nav-links{display:none}
}

/* ── layout ── */
.wrap{max-width:1180px;margin:0 auto;padding:0 28px;position:relative;z-index:1}
.section{padding:96px 0}
.section-tight{padding:56px 0}
@media (max-width:760px){.section{padding:64px 0}.section-tight{padding:40px 0}}

/* ── hero ── */
.hero{padding:120px 0 80px;position:relative}
.hero-eyebrow{
  font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--text-muted);
  display:inline-flex;align-items:center;gap:10px;margin-bottom:22px;
}
.hero-eyebrow::before{content:'';width:24px;height:1px;background:var(--grad);display:inline-block}
.hero h1{
  font-family:'Playfair Display',serif;font-weight:800;
  font-size:clamp(2.8rem, 6.2vw, 5.6rem);
  line-height:1.02;letter-spacing:-0.02em;
  margin:0 0 24px;max-width:18ch;
}
.hero h1 em{font-style:italic;background:var(--grad);background-clip:text;-webkit-background-clip:text;color:transparent;font-family:'Playfair Display',serif;font-weight:500}
.hero p{
  font-size:clamp(1.05rem, 1.6vw, 1.25rem);
  color:var(--text-dim);max-width:46ch;margin:0 0 36px;line-height:1.6;
}
.hero-actions{display:flex;gap:14px;flex-wrap:wrap}

/* ── buttons ── */
.btn{
  display:inline-flex;align-items:center;gap:10px;
  padding:14px 26px;border-radius:999px;
  font-family:'Inter',sans-serif;font-weight:600;font-size:14px;letter-spacing:0.01em;
  cursor:pointer;border:0;text-decoration:none;
  transition:transform var(--t-fast) var(--ease),box-shadow var(--t-med) var(--ease);
}
.btn-primary{
  background:var(--grad);color:#fff;
  box-shadow:0 8px 30px -8px rgba(139,92,246,.6);
}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 14px 40px -10px rgba(139,92,246,.8)}
.btn-ghost{
  background:rgba(255,255,255,.04);color:var(--text);
  border:1px solid var(--border-strong);
}
.btn-ghost:hover{background:rgba(255,255,255,.08)}

/* ── cards ── */
.card{
  background:linear-gradient(180deg,var(--surface) 0%,var(--surface-2) 100%);
  border:1px solid var(--border);
  border-radius:var(--r-lg);
  padding:30px;
  box-shadow:var(--shadow-1);
}
.card-hover{transition:transform var(--t-med) var(--ease),border-color var(--t-med) var(--ease),box-shadow var(--t-med) var(--ease)}
.card-hover:hover{transform:translateY(-4px);border-color:var(--border-strong);box-shadow:var(--shadow-1),var(--shadow-2)}

/* ── headings (in body content) ── */
h2.display{
  font-family:'Playfair Display',serif;font-weight:800;
  font-size:clamp(2rem,4vw,3.2rem);line-height:1.05;letter-spacing:-0.02em;
  margin:0 0 18px;
}
h2.display em{font-style:italic;font-weight:500;background:var(--grad);background-clip:text;-webkit-background-clip:text;color:transparent}
.section-eyebrow{
  font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;
  color:var(--accent-3);margin-bottom:14px;
}
.section-lead{color:var(--text-dim);font-size:1.08rem;max-width:62ch;margin:0 0 40px}

/* ── grids ── */
.grid{display:grid;gap:22px}
.grid-3{grid-template-columns:repeat(3,1fr)}
.grid-2{grid-template-columns:repeat(2,1fr)}
@media (max-width:900px){.grid-3{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.grid-3,.grid-2{grid-template-columns:1fr}}

/* ── feature card ── */
.feat{position:relative}
.feat .num{
  font-family:'Playfair Display',serif;font-style:italic;font-weight:500;
  font-size:48px;line-height:1;
  background:var(--grad);background-clip:text;-webkit-background-clip:text;color:transparent;
  margin-bottom:16px;display:block;
}
.feat h3{font-family:'Playfair Display',serif;font-weight:700;font-size:22px;margin:0 0 10px;letter-spacing:-0.01em}
.feat p{color:var(--text-dim);font-size:15px;margin:0;line-height:1.6}

/* ── package card ── */
.pkg{
  display:flex;flex-direction:column;
  position:relative;overflow:hidden;
}
.pkg::before{
  content:'';position:absolute;inset:0;border-radius:var(--r-lg);padding:1px;
  background:var(--grad-dim);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;
  opacity:0;transition:opacity var(--t-med) var(--ease);
  pointer-events:none;
}
.pkg:hover::before{opacity:1}
.pkg .tag{
  position:absolute;top:18px;right:18px;
  font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;
  padding:5px 10px;border-radius:999px;
  background:var(--grad);color:#fff;font-weight:700;
}
.pkg .pname{font-family:'Playfair Display',serif;font-weight:700;font-size:24px;margin:0 0 6px;letter-spacing:-0.01em}
.pkg .pblurb{color:var(--text-dim);font-size:14px;line-height:1.55;min-height:42px;margin:0 0 24px}
.pkg .pmeta{display:flex;align-items:baseline;gap:10px;margin-bottom:18px}
.pkg .pminutes{color:var(--text);font-size:14px}
.pkg .pbonus{
  font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.05em;
  color:var(--accent-3);
}
.pkg .pprice{
  font-family:'Playfair Display',serif;font-weight:800;font-size:42px;line-height:1;
  letter-spacing:-0.025em;margin-top:auto;
}
.pkg .pprice .rs{font-size:24px;vertical-align:top;margin-right:2px;font-weight:500;font-style:italic}
.pkg .pprice .gst{font-family:'Inter',sans-serif;font-weight:400;font-size:12px;color:var(--text-muted);margin-left:8px}

/* ── content typography (legal pages) ── */
.prose{max-width:780px}
.prose p{font-size:16px;line-height:1.75;color:var(--text-dim);margin:0 0 18px}
.prose strong{color:var(--text);font-weight:600}
.prose h3{font-family:'Playfair Display',serif;font-weight:700;font-size:24px;margin:48px 0 14px;color:var(--text);letter-spacing:-0.01em}
.prose h4{font-family:'Inter',sans-serif;font-weight:600;font-size:16px;margin:28px 0 8px;color:var(--text);letter-spacing:0}
.prose ul,.prose ol{padding-left:24px;margin:0 0 22px;color:var(--text-dim)}
.prose li{margin-bottom:9px;line-height:1.7}
.prose li::marker{color:var(--accent-2)}
.prose hr{border:0;border-top:1px solid var(--border);margin:48px 0}
.prose .meta{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-muted);margin-bottom:32px}
.prose code{font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,.04);padding:2px 8px;border-radius:6px;font-size:13px;color:var(--text)}

/* ── kv (definition list) ── */
.kv{display:grid;grid-template-columns:200px 1fr;gap:14px 24px;margin:0}
.kv dt{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--text-muted);padding-top:6px}
.kv dd{margin:0;color:var(--text);font-size:16px;line-height:1.55}
@media (max-width:640px){.kv{grid-template-columns:1fr;gap:4px 0}.kv dt{padding-top:14px}}

/* ── timeline (refunds) ── */
.timeline{position:relative;margin:32px 0;padding-left:42px}
.timeline::before{content:'';position:absolute;left:14px;top:8px;bottom:8px;width:1px;background:var(--grad);opacity:.5}
.tl-step{position:relative;padding-bottom:32px}
.tl-step:last-child{padding-bottom:0}
.tl-step::before{
  content:'';position:absolute;left:-34px;top:6px;width:14px;height:14px;border-radius:50%;
  background:var(--bg-0);border:2px solid var(--accent-2);
  box-shadow:0 0 0 4px rgba(139,92,246,.18);
}
.tl-step h4{margin:0 0 6px;font-family:'Playfair Display',serif;font-weight:700;font-size:18px;color:var(--text)}
.tl-step p{margin:0;color:var(--text-dim);font-size:15px}

/* ── footer ── */
.footer{
  margin-top:120px;padding:60px 0 40px;
  border-top:1px solid var(--border);
  background:rgba(0,0,0,.3);
}
.footer-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:48px;margin-bottom:48px}
@media (max-width:760px){.footer-grid{grid-template-columns:1fr 1fr;gap:32px}}
.footer h5{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:var(--text-muted);margin:0 0 18px}
.footer ul{list-style:none;padding:0;margin:0}
.footer li{margin-bottom:10px;font-size:14px;color:var(--text-dim)}
.footer li a:hover{color:#fff}
.footer-foot{
  border-top:1px solid var(--border);padding-top:28px;
  display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;
  font-size:13px;color:var(--text-muted);font-family:'JetBrains Mono',monospace;
}

/* ── reveal ── */
.reveal{opacity:0;transform:translateY(20px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:0ms!important;transition-duration:0ms!important}
  .reveal{opacity:1;transform:none}
}
"""

_REVEAL_JS = """
(function(){
  if(!('IntersectionObserver' in window))return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}});
  },{rootMargin:'0px 0px -10% 0px',threshold:0.05});
  document.querySelectorAll('.reveal').forEach(function(n){io.observe(n)});
})();
"""


def _nav(active: str) -> str:
    """Top navigation. `active` matches one of: home, about, products, contact, terms, refunds, privacy."""
    items = [
        ("/", "Home", "home"),
        ("/about-us", "About", "about"),
        ("/products", "Packages", "products"),
        ("/contact-us", "Contact", "contact"),
    ]
    links_html = "".join(
        f'<a href="{href}" class="{ "active" if key == active else "" }">{label}</a>'
        for href, label, key in items
    )
    return (
        '<nav class="nav"><div class="nav-inner">'
        '<a href="/" class="brand"><span class="brand-mark"></span>'
        f'<span>{BUSINESS_NAME.split()[0]}</span></a>'
        f'<div class="nav-links">{links_html}</div>'
        '</div></nav>'
    )


def _footer() -> str:
    year = datetime.now().year
    return (
        '<footer class="footer"><div class="wrap">'
        '<div class="footer-grid">'
        '<div>'
        f'<div class="brand" style="margin-bottom:14px"><span class="brand-mark"></span>'
        f'<span>{BUSINESS_NAME}</span></div>'
        f'<p style="color:var(--text-muted);font-size:14px;margin:0 0 14px;max-width:30ch">{BUSINESS_TAGLINE}</p>'
        f'<p style="color:var(--text-muted);font-size:12px;margin:0;line-height:1.5">'
        f'{BUSINESS_NAME} is the operating brand of<br>'
        f'<strong style="color:var(--text-dim)">{LEGAL_ENTITY_NAME}</strong><br>'
        f'<span style="font-family:\'JetBrains Mono\',monospace">CIN {LEGAL_ENTITY_CIN}</span>'
        '</p>'
        '</div>'
        '<div><h5>Product</h5><ul>'
        '<li><a href="/products">Packages</a></li>'
        '<li><a href="/about-us">About</a></li>'
        '<li><a href="/contact-us">Contact</a></li>'
        '</ul></div>'
        '<div><h5>Legal</h5><ul>'
        '<li><a href="/terms">Terms &amp; conditions</a></li>'
        '<li><a href="/refunds">Refunds &amp; cancellations</a></li>'
        '<li><a href="/privacy-policy">Privacy policy</a></li>'
        '</ul></div>'
        '<div><h5>Reach us</h5><ul>'
        f'<li><a href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a></li>'
        f'<li>{BUSINESS_PHONE}</li>'
        f'<li style="color:var(--text-muted)">{BUSINESS_HOURS}</li>'
        '</ul></div>'
        '</div>'
        '<div class="footer-foot">'
        f'<div>© {year} {LEGAL_ENTITY_NAME}. All rights reserved.</div>'
        f'<div>Made in {BUSINESS_CITY}.</div>'
        '</div>'
        '</div></footer>'
    )


def _shell(title: str, active: str, body_html: str) -> HTMLResponse:
    """Wrap a page body in the shared chrome and return with a permissive CSP.

    CSP allows Google Fonts (style+font src), and our own inline
    style/script. No external scripts, no third-party trackers.
    """
    html = (
        '<!doctype html><html lang="en"><head>'
        '<meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{title} · {BUSINESS_NAME}</title>'
        f'<meta name="description" content="{BUSINESS_TAGLINE}">'
        '<meta name="robots" content="index,follow">'
        '<meta name="theme-color" content="#06080F">'
        f'{_FONTS}'
        f'<style>{_CSS}</style>'
        '</head><body>'
        f'{_nav(active)}'
        f'{body_html}'
        f'{_footer()}'
        f'<script>{_REVEAL_JS}</script>'
        '</body></html>'
    )
    csp = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "script-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return HTMLResponse(content=html, headers={"Content-Security-Policy": csp})


# ── Routes ────────────────────────────────────────────────────────────


@router.get("/", response_class=HTMLResponse, include_in_schema=False)
async def landing():
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Primus Platform · v1.0.25</div>'
        '<h1>The arcade <em>back-of-house</em>, built for India.</h1>'
        '<p>Self-service kiosks, dynamic time-package inventory, and instant UPI payments — '
        'engineered for the cafés where the next generation of esports actually plays.</p>'
        '<div class="hero-actions">'
        '<a href="/products" class="btn btn-primary">Explore packages</a>'
        '<a href="/about-us" class="btn btn-ghost">About Primus</a>'
        '</div>'
        '</div>'
        '</section>'

        '<section class="section wrap">'
        '<div class="reveal">'
        '<div class="section-eyebrow">What we do</div>'
        '<h2 class="display">Three layers, <em>one platform</em>.</h2>'
        '<p class="section-lead">Primus runs the boring part of running a gaming café — '
        'so the operators can focus on the room, the events, and the players.</p>'
        '</div>'
        '<div class="grid grid-3">'
        '<div class="card card-hover feat reveal"><span class="num">01</span>'
        '<h3>Kiosk</h3><p>A locked-down Windows client with a touch-friendly React UI. '
        'One tap to log in, browse packages, top up time, and start a session.</p></div>'
        '<div class="card card-hover feat reveal"><span class="num">02</span>'
        '<h3>Inventory</h3><p>Café operators define time packages — duration, pricing, bonuses, '
        'happy-hour windows — and they sync to every kiosk in real time.</p></div>'
        '<div class="card card-hover feat reveal"><span class="num">03</span>'
        '<h3>Payments</h3><p>UPI, cards, netbanking, wallets — all through Cashfree, '
        'with HMAC-signed webhooks and idempotent crediting. Time hits the account in seconds.</p></div>'
        '</div>'
        '</section>'

        '<section class="section-tight wrap">'
        '<div class="card reveal" style="padding:48px;text-align:center">'
        '<div class="section-eyebrow" style="margin-bottom:18px">Open for partnerships</div>'
        '<h2 class="display" style="margin:0 0 18px">Run a café? '
        '<em>Let&rsquo;s talk.</em></h2>'
        '<p style="color:var(--text-dim);max-width:50ch;margin:0 auto 24px">'
        'Onboarding is a 30-minute call and a hardware fingerprint — no SaaS contracts, '
        'no per-seat pricing tricks. We make money when your players do.</p>'
        f'<a href="mailto:{BUSINESS_EMAIL}" class="btn btn-primary">Email us</a>'
        '</div>'
        '</section>'
    )
    return _shell("Home", "home", body)


@router.get("/about-us", response_class=HTMLResponse, include_in_schema=False)
async def about_us():
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">About</div>'
        '<h1>We build the <em>plumbing</em>, not the spotlight.</h1>'
        '<p>Primus is a small team of operators and engineers building the back-end of '
        'India&rsquo;s gaming-café economy — quietly, systematically, with care.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap">'
        '<div class="grid grid-2" style="gap:48px;align-items:start">'
        '<div class="reveal prose">'
        '<div class="section-eyebrow">The parent company</div>'
        f'<h2 class="display">A brand of <em>{LEGAL_ENTITY_NAME.title()}</em>.</h2>'
        f'<p>{LEGAL_ENTITY_DESCRIPTION}</p>'
        f'<p><strong>{BUSINESS_NAME}</strong> is the technology platform within '
        f'this group that builds and operates the kiosk software, payment '
        f'infrastructure, and dynamic-inventory tooling for partner cafés.</p>'
        '<p>If you&rsquo;re a Cashfree reviewer, an auditor, or a partner doing '
        'KYC: the registered name on file is '
        f'<strong>{LEGAL_ENTITY_NAME}</strong>, CIN <code>{LEGAL_ENTITY_CIN}</code>, '
        f'office at {LEGAL_ENTITY_ADDRESS}.</p>'
        '</div>'
        '<div class="reveal">'
        '<div class="card" style="padding:36px">'
        '<div class="section-eyebrow" style="margin-bottom:18px">Company snapshot</div>'
        '<dl class="kv">'
        f'<dt>Legal name</dt><dd>{LEGAL_ENTITY_NAME}</dd>'
        f'<dt>Operating brand</dt><dd>{BUSINESS_NAME}</dd>'
        f'<dt>Company type</dt><dd>{LEGAL_ENTITY_TYPE}</dd>'
        f'<dt>CIN</dt><dd><code style="font-family:\'JetBrains Mono\',monospace;font-size:12px">{LEGAL_ENTITY_CIN}</code></dd>'
        f'<dt>Registered office</dt><dd>{LEGAL_ENTITY_ADDRESS}</dd>'
        f'<dt>Operations</dt><dd>{BUSINESS_CITY}, India</dd>'
        '<dt>Payment partner</dt><dd>Cashfree Payments India Pvt Ltd</dd>'
        '<dt>Compliance</dt><dd>DPDP Act 2023, IT Rules 2011, GST</dd>'
        '</dl>'
        '</div>'
        '</div>'
        '</div>'
        '</section>'

        '<section class="section wrap">'
        '<div class="reveal">'
        '<div class="section-eyebrow">What we believe</div>'
        '<h2 class="display">Three things, <em>strongly held</em>.</h2>'
        '</div>'
        '<div class="grid grid-3" style="margin-top:36px">'
        '<div class="card card-hover feat reveal"><span class="num">i</span>'
        '<h3>Operators first</h3>'
        '<p>The café owner is the customer who pays us. Every product decision starts with: '
        'does this make their day easier?</p></div>'
        '<div class="card card-hover feat reveal"><span class="num">ii</span>'
        '<h3>Honest pricing</h3>'
        '<p>No setup fees, no per-feature gates, no surprise bills. Transaction-based, '
        'transparent, and aligned.</p></div>'
        '<div class="card card-hover feat reveal"><span class="num">iii</span>'
        '<h3>Boring reliability</h3>'
        '<p>Multi-DB tenancy, signed webhooks, replay-protected payment flows. The kiosk '
        'doesn&rsquo;t need to be flashy — it needs to never lose a transaction.</p></div>'
        '</div>'
        '</section>'

        '<section class="section-tight wrap">'
        '<div class="card reveal" style="padding:48px;text-align:center;background:var(--grad-dim)">'
        '<h2 class="display" style="margin:0 0 14px">Curious how it fits <em>your</em> café?</h2>'
        '<p style="color:var(--text-dim);max-width:46ch;margin:0 auto 22px">'
        'A 30-minute walkthrough is the fastest way to see whether Primus belongs in '
        'your control room.</p>'
        f'<a href="mailto:{BUSINESS_EMAIL}" class="btn btn-primary">Schedule a demo</a>'
        '</div>'
        '</section>'
    )
    return _shell("About", "about", body)


@router.get("/products", response_class=HTMLResponse, include_in_schema=False)
async def products():
    cards = []
    for p in PACKAGES:
        tag_html = f'<span class="tag">{p["tag"]}</span>' if p["tag"] else ""
        bonus_html = (
            f'<span class="pbonus">+{p["bonus"]} bonus min</span>'
            if p["bonus"] else ""
        )
        cards.append(
            f'<div class="card card-hover pkg reveal">'
            f'{tag_html}'
            f'<h3 class="pname">{p["name"]}</h3>'
            f'<p class="pblurb">{p["blurb"]}</p>'
            f'<div class="pmeta">'
            f'<span class="pminutes">{_fmt_duration(p["minutes"])}</span>'
            f'{bonus_html}'
            f'</div>'
            f'<div class="pprice"><span class="rs">₹</span>{p["price"]}'
            f'<span class="gst">incl. GST</span></div>'
            f'</div>'
        )
    cards_html = "".join(cards)

    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Packages</div>'
        '<h1>Time, <em>priced honestly</em>, in INR.</h1>'
        '<p>The Primus shop sells prepaid gaming-time packages on the kiosk. '
        'All prices below are inclusive of applicable GST. Final pricing is set by '
        'the operating café and shown again at checkout.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap" style="padding-top:24px">'
        '<div class="grid grid-3">'
        f'{cards_html}'
        '</div>'
        '</section>'

        '<section class="section-tight wrap">'
        '<div class="card reveal" style="padding:40px">'
        '<div class="section-eyebrow">How it works</div>'
        '<h2 class="display" style="margin-bottom:32px">Five taps, <em>one play session</em>.</h2>'
        '<div class="grid grid-2" style="gap:48px">'
        '<div class="prose" style="margin:0">'
        '<ol>'
        '<li>Walk up to a Primus kiosk at any partner café.</li>'
        '<li>Sign in with your Primus account, or register on the spot in 20 seconds.</li>'
        '<li>Pick a package, add to cart, tap <strong>Pay</strong>.</li>'
        '<li>Complete the payment on the secure Cashfree screen — UPI, card, netbanking, wallets.</li>'
        '<li>Time is credited instantly. Walk to your station.</li>'
        '</ol>'
        '</div>'
        '<div class="prose" style="margin:0">'
        '<h4 style="margin-top:0">Refunds &amp; cancellations</h4>'
        '<p>Failed-payment debits are auto-reversed by Cashfree. For any other refund query, '
        f'see the <a class="link" href="/refunds">refunds page</a> or email '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a>.</p>'
        '<h4>Payment partners</h4>'
        '<p>All payments are processed via Cashfree Payments India Pvt Ltd, '
        'a PCI-DSS-certified RBI-licensed gateway.</p>'
        '</div>'
        '</div>'
        '</div>'
        '</section>'
    )
    return _shell("Packages", "products", body)


@router.get("/contact-us", response_class=HTMLResponse, include_in_schema=False)
async def contact_us():
    gstin_row = (
        f'<dt>GSTIN</dt><dd>{BUSINESS_GSTIN}</dd>' if BUSINESS_GSTIN else ""
    )
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Contact</div>'
        '<h1>Talk to a <em>person</em>, not a ticket.</h1>'
        '<p>Email reaches a real human within one business day. The phone is staffed during '
        'the hours below — leave a message outside them and we&rsquo;ll call back.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap" style="padding-top:0">'

        # Legal entity card — top of page, full width, so Cashfree's
        # reviewer (and any auditor) sees it before anything else.
        '<div class="reveal" style="margin-bottom:32px">'
        '<div class="card" style="padding:40px">'
        '<div class="section-eyebrow" style="margin-bottom:24px">Legal entity</div>'
        '<dl class="kv">'
        f'<dt>Registered name</dt><dd><strong>{LEGAL_ENTITY_NAME}</strong></dd>'
        f'<dt>Operating brand</dt><dd>{BUSINESS_NAME}</dd>'
        f'<dt>Company type</dt><dd>{LEGAL_ENTITY_TYPE}</dd>'
        f'<dt>CIN</dt><dd><code style="font-family:\'JetBrains Mono\',monospace;background:rgba(255,255,255,.04);padding:3px 10px;border-radius:6px;font-size:13px">{LEGAL_ENTITY_CIN}</code></dd>'
        f'<dt>Registered office</dt><dd>{LEGAL_ENTITY_ADDRESS}</dd>'
        f'{gstin_row}'
        '</dl>'
        '</div>'
        '</div>'

        '<div class="grid grid-2" style="gap:32px;align-items:start">'

        '<div class="reveal">'
        '<div class="card" style="padding:40px">'
        '<div class="section-eyebrow" style="margin-bottom:24px">Primary channels</div>'
        '<dl class="kv">'
        f'<dt>Business name</dt><dd>{BUSINESS_NAME}</dd>'
        f'<dt>Email</dt><dd><a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a></dd>'
        f'<dt>Phone</dt><dd>{BUSINESS_PHONE}</dd>'
        f'<dt>Operations office</dt><dd>{BUSINESS_ADDRESS}</dd>'
        f'<dt>Operating hours</dt><dd>{BUSINESS_HOURS}</dd>'
        '</dl>'
        '</div>'
        '</div>'

        '<div class="reveal">'
        '<div class="card" style="padding:40px;background:var(--grad-dim)">'
        '<div class="section-eyebrow" style="color:#fff;margin-bottom:24px">Grievance officer</div>'
        '<p style="margin:0 0 18px;color:var(--text)">'
        'Per the Information Technology Rules, 2011 (and the Digital Personal '
        'Data Protection Act, 2023), every Indian platform must designate a '
        'grievance officer for data and service complaints.</p>'
        '<dl class="kv">'
        f'<dt>Officer</dt><dd>{GRIEVANCE_OFFICER_NAME}</dd>'
        f'<dt>Email</dt><dd><a class="link" href="mailto:{GRIEVANCE_OFFICER_EMAIL}">{GRIEVANCE_OFFICER_EMAIL}</a></dd>'
        '<dt>Response SLA</dt><dd>15 days from receipt</dd>'
        '</dl>'
        '</div>'
        '</div>'

        '</div>'

        '<div class="grid grid-3" style="margin-top:48px">'
        '<div class="card reveal">'
        '<h4 style="font-family:\'Playfair Display\',serif;font-weight:700;font-size:18px;margin:0 0 8px">For café operators</h4>'
        '<p style="color:var(--text-dim);font-size:14px;margin:0">Onboarding, hardware, kiosk registration, '
        f'payment reconciliation. Email <a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a>.</p>'
        '</div>'
        '<div class="card reveal">'
        '<h4 style="font-family:\'Playfair Display\',serif;font-weight:700;font-size:18px;margin:0 0 8px">For players</h4>'
        '<p style="color:var(--text-dim);font-size:14px;margin:0">Refunds, account access, unrecognised charges. '
        'Quote your order ID (begins with <code style="font-family:\'JetBrains Mono\',monospace;background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px">PRIMUS_</code>).</p>'
        '</div>'
        '<div class="card reveal">'
        '<h4 style="font-family:\'Playfair Display\',serif;font-weight:700;font-size:18px;margin:0 0 8px">For press &amp; partnerships</h4>'
        '<p style="color:var(--text-dim);font-size:14px;margin:0">'
        f'Email <a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> with subject '
        '<em>&ldquo;Press&rdquo;</em> or <em>&ldquo;Partnership&rdquo;</em>.</p>'
        '</div>'
        '</div>'

        '</section>'
    )
    return _shell("Contact", "contact", body)


@router.get("/terms", response_class=HTMLResponse, include_in_schema=False)
async def terms():
    today = datetime.now().strftime("%d %B %Y")
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Legal</div>'
        '<h1>Terms <em>&amp; conditions</em>.</h1>'
        '<p>These terms govern your use of the Primus kiosk platform operated by '
        f'{BUSINESS_NAME}. By creating an account, signing in, or completing a payment '
        'through the platform, you confirm that you have read and accepted them.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap" style="padding-top:0">'
        f'<div class="prose reveal">'
        f'<p class="meta">Last updated · {today}</p>'

        '<h3>1. Definitions</h3>'
        f'<p>&ldquo;{BUSINESS_NAME}&rdquo;, &ldquo;Primus&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo; refers to '
        f'<strong>{LEGAL_ENTITY_NAME}</strong>, a {LEGAL_ENTITY_TYPE} incorporated '
        f'in India under CIN <code>{LEGAL_ENTITY_CIN}</code>, with its registered '
        f'office at {LEGAL_ENTITY_ADDRESS}, and operations office at '
        f'{BUSINESS_ADDRESS}. {BUSINESS_NAME} is the consumer-facing brand under '
        'which we operate. &ldquo;Platform&rdquo; means the Primus kiosk '
        'application, admin web portal, and supporting backend services. '
        '&ldquo;User&rdquo;, &ldquo;you&rdquo; means any individual who creates a '
        'Primus account or completes a transaction through the platform. '
        '&ldquo;Operator&rdquo; means a gaming café that has licensed the Primus '
        'kiosk for use at its premises.</p>'

        '<h3>2. Eligibility</h3>'
        '<p>You must be at least <strong>13 years old</strong> to create an account. '
        'Users under 18 must have verifiable parental or guardian consent before '
        'making any paid transaction. By using the platform you represent that you '
        'meet these requirements and that the information you provide is accurate.</p>'

        '<h3>3. Account registration</h3>'
        '<p>You may register using your name, email, phone number, and a password. '
        'You are responsible for keeping your credentials confidential. Any activity '
        'taking place under your account is presumed to be authorised by you. '
        'Notify us immediately at '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> '
        'if you suspect unauthorised use.</p>'

        '<h3>4. Services</h3>'
        '<p>Primus operates a self-service kiosk that lets you:</p>'
        '<ul>'
        '<li>Purchase prepaid time packages, billed in Indian Rupees (INR).</li>'
        '<li>Top up wallet balance for use across kiosks at the same café.</li>'
        '<li>Manage and resume gaming sessions on the operator&rsquo;s PCs.</li>'
        '<li>View receipts and historical transactions.</li>'
        '</ul>'
        '<p>The platform itself is operated by Primus; the physical café environment, '
        'PC hardware, peripherals, and on-site supervision are the responsibility '
        'of the Operator.</p>'

        '<h3>5. Pricing &amp; payments</h3>'
        '<p>All prices are listed in INR and are inclusive of applicable Goods &amp; '
        'Services Tax (GST) where displayed. Time packages are credited to your '
        'account once payment is confirmed by our payment partner, '
        '<strong>Cashfree Payments India Pvt Ltd</strong>, an RBI-licensed payment '
        'aggregator. Confirmation usually completes within seconds; in rare cases '
        'it may take up to a few minutes.</p>'
        '<p>Payment processing on the kiosk uses Cashfree&rsquo;s secure hosted '
        'checkout. Primus does not see, store, or transmit your full card number, '
        'CVV, UPI PIN, or banking credentials.</p>'

        '<h3>6. Refunds &amp; cancellations</h3>'
        '<p>The full refund and cancellation policy is set out at '
        '<a class="link" href="/refunds">/refunds</a> and forms part of these '
        'terms by reference. In summary: failed-but-debited payments are reversed '
        'automatically; eligible refunds are returned to the original payment '
        'method within 5–7 business days.</p>'

        '<h3>7. User conduct</h3>'
        '<p>You agree not to:</p>'
        '<ul>'
        '<li>Use the platform for any unlawful purpose.</li>'
        '<li>Attempt to reverse-engineer, tamper with, or extract data from the kiosk software.</li>'
        '<li>Resell, transfer, or sublicense your account or purchased time without our consent.</li>'
        '<li>Disrupt the platform via malware, denial-of-service, or unauthorised access attempts.</li>'
        '<li>Violate the operating café&rsquo;s house rules or local laws while using a Primus session.</li>'
        '</ul>'

        '<h3>8. Intellectual property</h3>'
        '<p>All trademarks, logos, source code, designs, and content on the platform '
        'are owned by Primus or its licensors. You receive a limited, non-exclusive, '
        'non-transferable right to use the platform for its intended consumer purpose. '
        'No other rights are granted.</p>'

        '<h3>9. Service availability</h3>'
        '<p>We aim to keep the platform available continuously but do not guarantee '
        'uninterrupted service. Scheduled maintenance windows are communicated to '
        'Operators via the admin dashboard. Emergency maintenance may occur with '
        'shorter notice.</p>'

        '<h3>10. Disclaimers</h3>'
        '<p>The platform is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; '
        'To the maximum extent permitted by law, we disclaim all warranties, express or '
        'implied, including merchantability, fitness for a particular purpose, '
        'and non-infringement.</p>'

        '<h3>11. Limitation of liability</h3>'
        '<p>To the maximum extent permitted by law, our aggregate liability to any '
        'single user for any claim arising out of or relating to the platform is '
        'limited to the total amount that user has paid to Primus in the '
        '<strong>thirty (30) days</strong> immediately preceding the event giving '
        'rise to the claim. We are not liable for indirect, incidental, special, '
        'consequential, or punitive damages.</p>'

        '<h3>12. Indemnification</h3>'
        '<p>You agree to indemnify and hold harmless Primus, its directors, '
        'employees, and partners from any claim arising out of your breach of '
        'these terms, your misuse of the platform, or your violation of any '
        'applicable law.</p>'

        '<h3>13. Termination</h3>'
        '<p>We may suspend or terminate your account if you breach these terms, '
        'engage in fraudulent activity, or use the platform in a way that risks '
        'harm to other users, Operators, or our payment partners. Termination '
        'does not relieve you of obligations accrued before termination.</p>'

        '<h3>14. Force majeure</h3>'
        '<p>Neither party is liable for delays or failures caused by events outside '
        'their reasonable control — including natural disasters, internet outages, '
        'banking-network failures, or government action.</p>'

        '<h3>15. Governing law &amp; jurisdiction</h3>'
        '<p>These terms are governed by the laws of <strong>India</strong>. Any '
        'dispute arising out of or in connection with the platform is subject to '
        f'the exclusive jurisdiction of the competent courts at <strong>{BUSINESS_CITY}, '
        'Telangana</strong>.</p>'

        '<h3>16. Changes to these terms</h3>'
        '<p>We may update these terms from time to time. Material changes are '
        'notified via the kiosk or by email. The &ldquo;last updated&rdquo; date '
        'above always reflects the current revision. Continued use of the '
        'platform after changes take effect constitutes acceptance.</p>'

        '<h3>17. Severability</h3>'
        '<p>If any provision of these terms is held invalid or unenforceable, '
        'the remainder continues in full force and effect.</p>'

        '<h3>18. Contact</h3>'
        '<p>Questions about these terms? Email '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> '
        f'or call {BUSINESS_PHONE} during operating hours.</p>'

        '</div>'
        '</section>'
    )
    return _shell("Terms & conditions", "terms", body)


@router.get("/refunds", response_class=HTMLResponse, include_in_schema=False)
async def refunds():
    today = datetime.now().strftime("%d %B %Y")
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Policy</div>'
        '<h1>Refunds <em>&amp; cancellations</em>.</h1>'
        '<p>Plain rules, written without lawyers&rsquo; tricks. If something goes wrong, '
        'we&rsquo;d rather refund you than argue about it.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap" style="padding-top:0">'
        '<div class="prose reveal">'
        f'<p class="meta">Last updated · {today} · Applies to all transactions on api.primustech.in</p>'

        '<h3>The short version</h3>'
        '<ul>'
        '<li><strong>Failed payment but bank debited:</strong> auto-reversed by Cashfree, '
        'usually within 5–7 business days. No action needed.</li>'
        '<li><strong>Duplicate charge:</strong> we refund the duplicate within '
        '<strong>3 business days</strong> of confirming it.</li>'
        '<li><strong>Service outage during your package:</strong> we refund the '
        'unused portion on request.</li>'
        '<li><strong>Used minutes:</strong> non-refundable.</li>'
        '<li><strong>Refund mode:</strong> always to the original payment method.</li>'
        '</ul>'

        '<h3>Eligible refund scenarios</h3>'

        '<h4>Failed payment with bank debit</h4>'
        '<p>If your bank deducts the amount but the kiosk does not credit minutes '
        'or wallet balance, the funds are returned by Cashfree directly to your '
        'source account. No request needed. Most banks complete the reversal '
        'within <strong>5–7 business days</strong>; some are same-day.</p>'

        '<h4>Duplicate charge</h4>'
        '<p>If you were charged twice for the same package, contact us with both '
        'order references (each begins with <code>PRIMUS_</code>). We confirm and '
        'refund the duplicate within 3 business days.</p>'

        '<h4>Service outage during a paid package</h4>'
        '<p>If a Primus-side outage prevented you from using time you had already '
        'paid for, we refund the affected portion on request. Time used before '
        'or after the outage is not refundable.</p>'

        '<h4>Goodwill refund (unused minutes within 7 days)</h4>'
        '<p>For unused minutes purchased within the past 7 days, refunds are at '
        'the operating café&rsquo;s discretion and may be processed wholly or '
        'partially. Beyond 7 days, packages are considered consumed.</p>'

        '<h3>How to request a refund</h3>'

        '<div class="timeline">'
        '<div class="tl-step"><h4>1. Email us</h4><p>'
        f'Send a note to <a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> '
        'with subject <em>&ldquo;Refund &mdash; PRIMUS_&lt;order id&gt;&rdquo;</em>.</p></div>'
        '<div class="tl-step"><h4>2. Include the order reference</h4><p>'
        'It&rsquo;s shown on the kiosk after purchase, format '
        '<code>PRIMUS_XXXXXXXXXXXXXXXX</code>. Without it we can&rsquo;t locate the transaction.</p></div>'
        '<div class="tl-step"><h4>3. We respond within 1 business day</h4><p>'
        'You&rsquo;ll get either a confirmation that the refund is being processed, '
        'or a clarifying question.</p></div>'
        '<div class="tl-step"><h4>4. Funds appear in 5–7 business days</h4><p>'
        'Refunds always go back to the original payment method (UPI app, card, '
        'netbanking, or wallet). The exact arrival time depends on your bank.</p></div>'
        '</div>'

        '<h3>Cancellations</h3>'
        '<p>An active gaming session cannot be cancelled mid-way. To stop '
        'consuming minutes, log out at the kiosk — remaining minutes stay on '
        'your account and can be used on a future visit to the same café.</p>'
        '<p>Time packages do not have a built-in expiry, but the operating café '
        'may set a usage window during onboarding (commonly 90 days).</p>'

        '<h3>Chargebacks &amp; bank disputes</h3>'
        '<p>If you initiate a chargeback through your bank without contacting us '
        'first, your account is temporarily locked while we investigate. We '
        'always prefer to resolve issues directly — a chargeback raises costs '
        'on every honest user.</p>'

        '<h3>Contact</h3>'
        '<p>For all refund queries: '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> · '
        f'{BUSINESS_PHONE}.</p>'

        '</div>'
        '</section>'
    )
    return _shell("Refunds & cancellations", "refunds", body)


@router.get("/privacy-policy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    today = datetime.now().strftime("%d %B %Y")
    body = (
        '<section class="hero wrap">'
        '<div class="reveal">'
        '<div class="hero-eyebrow">Privacy</div>'
        '<h1>Your data, <em>handled with care</em>.</h1>'
        '<p>What we collect, why we collect it, who sees it, and how long we keep it. '
        'Compliant with the Digital Personal Data Protection Act, 2023, and the '
        'Information Technology Rules, 2011.</p>'
        '</div>'
        '</section>'

        '<section class="section wrap" style="padding-top:0">'
        '<div class="prose reveal">'
        f'<p class="meta">Last updated · {today}</p>'

        '<h3>1. Who this policy applies to</h3>'
        '<p>This policy applies to any individual who creates a Primus account, '
        'signs in to the kiosk app, or completes a payment through the platform '
        f'operated by <strong>{LEGAL_ENTITY_NAME}</strong> '
        f'(CIN <code>{LEGAL_ENTITY_CIN}</code>), under the brand '
        f'<strong>{BUSINESS_NAME}</strong>. The legal entity is the data fiduciary '
        f'under the DPDP Act, 2023; its registered office is at '
        f'{LEGAL_ENTITY_ADDRESS}.</p>'

        '<h3>2. Information we collect</h3>'

        '<h4>Account information</h4>'
        '<ul>'
        '<li>Name, email, phone number.</li>'
        '<li>Password, stored as a one-way bcrypt hash. We never store your plaintext password.</li>'
        '</ul>'

        '<h4>Usage data</h4>'
        '<ul>'
        '<li>Sessions started and ended, including durations.</li>'
        '<li>Time packages purchased, wallet top-ups, coupon redemptions.</li>'
        '<li>Games or apps launched on the operating café&rsquo;s PCs (used to enforce platform-account assignment).</li>'
        '</ul>'

        '<h4>Payment metadata</h4>'
        '<ul>'
        '<li>Order references, payment status, payment amounts in INR.</li>'
        '<li>The payment method category (UPI / card / netbanking / wallet) and a masked identifier '
        'where Cashfree provides one (e.g., last 4 digits of a card).</li>'
        '<li><strong>We never see, store, or transmit</strong> your full card number, CVV, UPI PIN, '
        'or net-banking credentials. Those are handled exclusively by Cashfree, our PCI-DSS-certified '
        'payment partner.</li>'
        '</ul>'

        '<h4>Device data</h4>'
        '<ul>'
        '<li>The registered kiosk PC&rsquo;s hardware fingerprint and license key, used to bind a kiosk to its café.</li>'
        '<li>Operating-system version and IP address, used for fraud detection and rate limiting.</li>'
        '</ul>'

        '<h3>3. How we use your information</h3>'
        '<ul>'
        '<li><strong>Service operation:</strong> applying time you have purchased, resuming sessions, displaying receipts.</li>'
        '<li><strong>Payment processing:</strong> reconciliation with Cashfree and the operating café.</li>'
        '<li><strong>Security &amp; fraud prevention:</strong> detecting unauthorised access, replay attacks, or abuse.</li>'
        '<li><strong>Customer support:</strong> responding to your tickets and refund requests.</li>'
        '<li><strong>Legal &amp; tax compliance:</strong> retaining transaction records as required by Indian law.</li>'
        '</ul>'
        '<p>We do <strong>not</strong> sell your data, do <strong>not</strong> serve third-party '
        'advertising on the kiosk, and do <strong>not</strong> use your data to train AI models.</p>'

        '<h3>4. Legal basis (DPDP Act, 2023)</h3>'
        '<p>We process your personal data on the following lawful bases:</p>'
        '<ul>'
        '<li><strong>Contract:</strong> processing required to deliver the services you have purchased.</li>'
        '<li><strong>Consent:</strong> for any optional features (e.g., promotional emails) that you can opt in to or out of at any time.</li>'
        '<li><strong>Legal obligation:</strong> retention of financial and tax records.</li>'
        '<li><strong>Legitimate interest:</strong> security, fraud prevention, and platform analytics in aggregate form.</li>'
        '</ul>'

        '<h3>5. Sharing</h3>'
        '<p>We share data only with:</p>'
        '<ul>'
        '<li><strong>Cashfree Payments India Pvt Ltd</strong>, our payment processor, for the limited purpose of completing transactions.</li>'
        '<li><strong>The operating café</strong>, restricted to data needed to serve you on-site (account name, current package, current session).</li>'
        '<li><strong>Cloud infrastructure providers</strong> who host our backend, under strict data-processing agreements.</li>'
        '<li><strong>Government or judicial authorities</strong> when legally compelled.</li>'
        '</ul>'
        '<p>We do not transfer data outside India except where it is processed by '
        'cloud-infrastructure providers using region-equivalent safeguards.</p>'

        '<h3>6. Data retention</h3>'
        '<p>Account and transaction records are retained for <strong>7 years</strong> '
        'to comply with Indian tax and audit requirements. Marketing-consent records '
        'are retained for as long as the consent remains active. Backup copies expire '
        'on rolling schedules of up to 90 days.</p>'

        '<h3>7. Your rights</h3>'
        '<p>Subject to the DPDP Act and applicable law, you have the right to:</p>'
        '<ul>'
        '<li>Access a copy of the personal data we hold about you.</li>'
        '<li>Correct any inaccurate personal data.</li>'
        '<li>Request deletion of your account (subject to financial-record retention obligations).</li>'
        '<li>Withdraw consent for any optional processing.</li>'
        '<li>Lodge a complaint with the Data Protection Board of India.</li>'
        '</ul>'
        '<p>To exercise any of these rights, email '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a> from the email '
        'address registered to your account. We respond within 30 days.</p>'

        '<h3>8. Security measures</h3>'
        '<ul>'
        '<li>All API traffic is served over HTTPS with HSTS enforced.</li>'
        '<li>Passwords are stored as bcrypt hashes; refresh tokens are rotated on every use.</li>'
        '<li>Device-level secrets on the kiosk are sealed with Windows DPAPI (LocalMachine scope).</li>'
        '<li>Webhooks are HMAC-SHA256 signed and replay-protected with a ±5-minute timestamp window.</li>'
        '<li>Backend access is gated by SSO + 2FA for engineers, with full audit trails.</li>'
        '<li>Payment-card data is fully out of scope — handled by Cashfree under PCI-DSS.</li>'
        '</ul>'

        '<h3>9. Cookies</h3>'
        '<p>The kiosk app does not use third-party tracking cookies. The admin web '
        'portal stores authentication tokens in browser <code>localStorage</code> '
        '(not cookies); session cookies are httpOnly and same-site.</p>'

        '<h3>10. Children&rsquo;s privacy</h3>'
        '<p>The platform is not directed at children under 13. Users between 13 and '
        '18 must have parental consent for paid transactions. If you believe a child '
        'has registered without consent, contact us and we will remove the account.</p>'

        '<h3>11. Grievance officer</h3>'
        '<p>Per Rule 5(9) of the IT Rules, 2011 (and the DPDP Act, 2023), we have '
        'designated a grievance officer:</p>'
        '<ul>'
        f'<li><strong>{GRIEVANCE_OFFICER_NAME}</strong></li>'
        f'<li>Email: <a class="link" href="mailto:{GRIEVANCE_OFFICER_EMAIL}">{GRIEVANCE_OFFICER_EMAIL}</a></li>'
        '<li>Response time: within 15 days of receipt</li>'
        '</ul>'

        '<h3>12. Changes to this policy</h3>'
        '<p>We may update this policy as the platform evolves. The &ldquo;last '
        'updated&rdquo; date reflects the latest revision. We notify users of '
        'material changes via email and on the kiosk before they take effect.</p>'

        '<h3>13. Contact</h3>'
        '<p>Privacy questions or requests? Email '
        f'<a class="link" href="mailto:{BUSINESS_EMAIL}">{BUSINESS_EMAIL}</a>.</p>'

        '</div>'
        '</section>'
    )
    return _shell("Privacy policy", "privacy", body)


# ── Helpers ───────────────────────────────────────────────────────────


def _fmt_duration(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes} minutes"
    hours = minutes // 60
    rem = minutes % 60
    if rem == 0:
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    return f"{hours}h {rem}m"
