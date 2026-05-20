import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/app/routes/paths';
import useWalletStore from '@/app/store/useWalletStore';
import { homeService } from '@/features/home/services/homeService';

import '../../../styles/homepage.css';

/* Hardcoded Happy Hour window (TECH_DEBT #20 — no backend summary endpoint
   yet). Times are in the kiosk's local timezone so they match the customer's
   wall clock. 14:00 → 17:00 = 2 PM to 5 PM. */
const HAPPY_HOUR_START_HOUR = 14;
const HAPPY_HOUR_END_HOUR = 17;
const HAPPY_HOUR_PERCENT = 30;

/* Compute current Happy Hour state from the kiosk's local clock.
   Returns { active, label, sub, fillPct } updated by the caller on a
   1-minute interval so the countdown stays accurate without a backend
   ping. */
function computeHappyHour(now = new Date()) {
  const hour = now.getHours();
  const minute = now.getMinutes();
  const totalMins = hour * 60 + minute;
  const startMins = HAPPY_HOUR_START_HOUR * 60;
  const endMins = HAPPY_HOUR_END_HOUR * 60;

  // Inside the window — show "Active · Ends in Xh Ym".
  if (totalMins >= startMins && totalMins < endMins) {
    const remaining = endMins - totalMins;
    const eh = Math.floor(remaining / 60);
    const em = remaining % 60;
    const endLabel = eh > 0 ? `${eh}h ${em}m` : `${em}m`;
    const fillPct = ((totalMins - startMins) / (endMins - startMins)) * 100;
    return { active: true, label: `Active · Ends in ${endLabel}`, fillPct };
  }

  // Before the window — show "Starts in Xh Ym".
  if (totalMins < startMins) {
    const remaining = startMins - totalMins;
    const sh = Math.floor(remaining / 60);
    const sm = remaining % 60;
    const startLabel = sh > 0 ? `${sh}h ${sm}m` : `${sm}m`;
    return { active: false, label: `Starts in ${startLabel}`, fillPct: 0 };
  }

  // After the window — next instance is tomorrow at 2 PM.
  const remaining = (24 * 60 - totalMins) + startMins;
  const sh = Math.floor(remaining / 60);
  const sm = remaining % 60;
  return {
    active: false,
    label: `Starts tomorrow at ${HAPPY_HOUR_START_HOUR}:00`,
    sub: `in ${sh}h ${sm}m`,
    fillPct: 0,
  };
}

/* ============================================================
   NeoG Dashboard — Guna's design.

   Both the carousel slides AND the "Almost there!" quests are
   intentionally hardcoded placeholders right now. The quest system
   has two missing pieces (see TECH_DEBT.md #21):
     1. No admin UI exists for authoring quests.
     2. No backend engine auto-increments EventProgress when a user
        does the thing the quest tracks (login, streak, playtime).
   Until both pieces ship, a live "Almost there!" panel would just
   be empty forever for every customer.

   The carousel is hardcoded for a similar reason — no
   "featured / most-recently-played games" backend endpoint yet.

   Live wiring lives in:
     - features/quests/services/questsService.js (list + claim)
     - backend/app/api/endpoints/quests.py     (claim credits coins)
   so flipping back from mock to live is a one-screen edit once the
   gaps above close.
============================================================ */

const AUTO_INTERVAL_MS = 7000;

/* ---------- Inline SVG icons ---------- */
const I = {
  Play: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  ChevronLeft: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" {...p}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Diamond: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M12 2 2 12l10 10 10-10z" />
    </svg>
  ),
  Spark: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
    </svg>
  ),
  Clock: (p) => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" {...p}>
      <polyline points="5 12 10 17 19 7" />
    </svg>
  ),
  Flame: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}>
      <path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-1 3 1 5 3 5 1 0 2-1 2-2 0-2-2-3-2-9z" />
    </svg>
  ),
  Coin: (p) => (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" {...p}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
};

/* ---------- Hardcoded slide data (placeholder) ---------- */
const SLIDES = [
  {
    id: 'neonblade',
    tag: 'NEONBLADE',
    subtitle: 'CYBER COMBAT ARENA',
    title: ['NEON', 'BLADE'],
    cta: 'LAUNCH VIA EPIC',
    tags: ['CYBERPUNK', 'PVP ARENA', '4V4'],
    leftBg: 'radial-gradient(120% 80% at 0% 0%, #16223c 0%, #0a1124 45%, #06091a 100%)',
    media: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80&auto=format&fit=crop',
    videoSrc: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
  {
    id: 'valorshift',
    tag: 'VALORSHIFT',
    subtitle: 'TACTICAL FPS',
    title: ['VALOR', 'SHIFT'],
    cta: 'LAUNCH VIA STEAM',
    tags: ['TACTICAL', '5V5', 'RANKED'],
    leftBg: 'radial-gradient(120% 80% at 0% 0%, #3a1830 0%, #1a0a1a 45%, #08050d 100%)',
    media: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1600&q=80&auto=format&fit=crop',
    videoSrc: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    id: 'stormrift',
    tag: 'STORMRIFT',
    subtitle: 'MOBA UNIVERSE',
    title: ['STORM', 'RIFT'],
    cta: 'LAUNCH NOW',
    tags: ['MOBA', 'STRATEGY', '5V5'],
    leftBg: 'radial-gradient(120% 80% at 0% 0%, #0e2f30 0%, #061a1c 45%, #03090e 100%)',
    media: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1600&q=80&auto=format&fit=crop',
    videoSrc: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

/* ---------- Hardcoded quests data (placeholder).
   All three reward coins only — kiosk doesn't have an XP column
   on the user model yet (see TECH_DEBT.md #19). Reward amounts are
   mirrored on the backend in app/api/endpoints/home.py so the kiosk
   label and the backend credit can never drift. */
const QUESTS = [
  {
    id: 'checkin',
    icon: <I.Check />,
    color: '#8B5CF6',
    title: 'Daily Check-In',
    desc: 'Log in today',
    coins: 25,
    progressLabel: '1/1',
    claimable: true,
    percent: 100,
  },
  {
    id: 'streak',
    icon: <I.Flame />,
    color: '#7C3AED',
    title: 'Streak Master',
    desc: 'Log in 7 days in a row',
    coins: 25,
    progressLabel: '6/7 days',
    claimable: true,
    percent: 86,
  },
  {
    id: 'hour',
    icon: <I.Clock />,
    color: '#D946EF',
    title: 'Hour Power',
    desc: 'Spend at least 1 hour today',
    coins: 50,
    progressLabel: '45/60 min',
    claimable: true,
    percent: 75,
  },
];

/* ============================================================
   Carousel — left content + right media (image + video overlay)
============================================================ */
function Carousel({ slide }) {
  return (
    <section className="neog-carousel" key={slide.id}>
      <div className="neog-carousel__left" style={{ background: slide.leftBg }}>
        <div className="neog-carousel__left-inner">
          <div className="neog-tagrow">
            <span className="neog-pill">{slide.tag}</span>
            <span className="neog-subtitle">{slide.subtitle}</span>
          </div>

          <h1 className="neog-title">
            {slide.title.map((line, i) => (
              <span key={i} className="neog-title__line">{line}</span>
            ))}
          </h1>

          {/* LAUNCH CTA is intentionally a no-op — the slides are mock games
              that don't exist in the catalog. Wire onClick once the home
              carousel switches to real game data. */}
          <button type="button" className="neog-cta">
            <I.Play /> {slide.cta}
          </button>

          <ul className="neog-links">
            <li>
              <Link to={ROUTES.challenges} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <I.Diamond style={{ color: '#ff6b35' }} /> EXPLORE CHALLENGES
              </Link>
            </li>
            <li>
              <Link to={ROUTES.quests} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <I.Spark style={{ color: '#ff6b35' }} /> EXPLORE QUESTS
              </Link>
            </li>
          </ul>

          <div className="neog-chips">
            {slide.tags.map((t) => (
              <span key={t} className="neog-chip">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="neog-carousel__right">
        <div
          className="neog-carousel__media"
          style={{ backgroundImage: `url(${slide.media})` }}
        >
          {slide.videoSrc ? (
            <video
              key={slide.videoSrc}
              className="neog-carousel__video"
              src={slide.videoSrc}
              poster={slide.media}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
            />
          ) : null}

          <div className="neog-carousel__media-overlay" />
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Carousel Controls (bottom-right)
============================================================ */
function CarouselControls({ index, total, onPrev, onNext, onJump }) {
  return (
    <div className="neog-carousel-controls">
      <div className="neog-carousel-controls__row">
        <div className="neog-dots" role="tablist">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              className={`neog-dot ${i === index ? 'is-active' : ''}`}
              onClick={() => onJump(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <div className="neog-carousel-arrows glass">
          <span className="neog-arrowdiv" />
          <button className="neog-arrowbtn" onClick={onPrev} aria-label="Previous">
            <I.ChevronLeft />
          </button>
          <span className="neog-arrowdiv" />
          <button className="neog-arrowbtn" onClick={onNext} aria-label="Next">
            <I.ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Right Panel — hardcoded happy hour + hardcoded quests
============================================================ */
function RightPanel({ open, claimedKinds, claimingKind, claimError, onClaim, happyHour, learnMoreOpen, onToggleLearnMore }) {
  const arcLen = 251;
  const filled = Math.round((arcLen * (happyHour?.fillPct || 0)) / 100);
  return (
    <aside className={`neog-rightpanel ${open ? 'is-open' : 'is-closed'} glass`}>
      {/* Happy Hour card — visual mock; no /happy-hour/current endpoint yet
          (TECH_DEBT.md #20). Countdown derived from kiosk's local clock. */}
      <div className="neog-hh">
        <div className="neog-hh__head">
          <span className="neog-hh__title">
            Happy Hour: {HAPPY_HOUR_START_HOUR}-{HAPPY_HOUR_END_HOUR} PM
          </span>
          <span className="neog-hh__clock"><I.Clock /></span>
        </div>

        <div className="neog-hh__arc">
          <svg viewBox="0 0 200 110" className="neog-hh__arc-svg">
            <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" strokeLinecap="round" strokeDasharray="6 8" />
            <path d="M20,100 A80,80 0 0,1 180,100" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${arcLen}`} />
          </svg>
          <span className="neog-hh__arc-label">
            {HAPPY_HOUR_START_HOUR} – {HAPPY_HOUR_END_HOUR} PM
          </span>
        </div>

        <div className="neog-hh__pct">
          <span className="neog-hh__pct-num">{HAPPY_HOUR_PERCENT}%</span>
          <span className="neog-hh__pct-text">EXTRA on all sessions</span>
        </div>

        <div className="neog-hh__meta">
          <span className="neog-hh__meta-dot" />
          {happyHour?.label || ''}
        </div>

        {learnMoreOpen && (
          <div
            role="region"
            aria-label="Happy Hour details"
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'rgba(255, 255, 255, 0.92)',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>How it works</strong>
            <p style={{ margin: 0 }}>
              Buy any time pack between {HAPPY_HOUR_START_HOUR}:00 and {HAPPY_HOUR_END_HOUR}:00 to get{' '}
              {HAPPY_HOUR_PERCENT}% extra session time at no extra cost. Auto-applied at
              checkout — no code needed.
            </p>
          </div>
        )}

        <div className="neog-hh__footer">
          <button
            type="button"
            className="neog-hh__btn"
            onClick={onToggleLearnMore}
            aria-expanded={learnMoreOpen}
            style={{ border: 'none', cursor: 'pointer' }}
          >
            {learnMoreOpen ? 'Close' : 'Learn More'}
          </button>
        </div>
      </div>

      <h3 className="neog-section-title">Almost there!</h3>

      {claimError && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            margin: '0 0 8px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: 12,
          }}
        >
          {claimError}
        </div>
      )}

      <ul className="neog-quests">
        {QUESTS.map((q) => {
          const isClaimed = claimedKinds.includes(q.id);
          const isClaiming = claimingKind === q.id;
          const canClaim = q.claimable && !isClaimed;
          return (
            <li className="neog-quest" key={q.id}>
              <div
                className="neog-quest__icon"
                style={{ background: `${q.color}22`, color: q.color }}
              >
                {q.icon}
              </div>

              <div className="neog-quest__body">
                <div className="neog-quest__top">
                  <span className="neog-quest__title">{q.title}</span>
                  {isClaimed ? (
                    <span className="neog-quest__pct">Claimed</span>
                  ) : canClaim ? (
                    <button
                      type="button"
                      className="neog-quest__claim"
                      onClick={() => onClaim(q.id)}
                      disabled={isClaiming}
                      style={{
                        background: '#ff6b35',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: 999,
                        cursor: isClaiming ? 'wait' : 'pointer',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {isClaiming ? 'Claiming…' : 'Claim!'}
                    </button>
                  ) : (
                    <span className="neog-quest__pct">{q.percent}%</span>
                  )}
                </div>
                <div className="neog-quest__desc">{q.desc}</div>
                <div className="neog-quest__rewards">
                  <span className="neog-reward">
                    <I.Coin style={{ color: '#ff6b35' }} /> {q.coins}
                  </span>
                  <span className="neog-quest__progress">{q.progressLabel}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function PanelToggle({ open, onClick }) {
  return (
    <button
      className={`neog-paneltoggle ${open ? 'is-open' : ''}`}
      onClick={onClick}
      aria-label={open ? 'Close panel' : 'Open panel'}
      aria-expanded={open}
    >
      {open ? <I.ChevronRight /> : <I.ChevronLeft />}
    </button>
  );
}

/* ============================================================
   Root
============================================================ */
export default function HomePage() {
  const hydrate = useWalletStore((s) => s.hydrate);

  const [index, setIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [claimedKinds, setClaimedKinds] = useState([]);
  const [claimingKind, setClaimingKind] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const startRef = useRef(Date.now());

  // Re-render every minute so the Happy Hour countdown stays current
  // without any backend polling. One-minute granularity is enough for
  // the label format ("Starts in 53m", "Active · Ends in 12m").
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const happyHour = useMemo(() => computeHappyHour(now), [now]);

  // Pre-populate claimed badges from backend so navigating away and back
  // doesn't reset the UI to "Claim!" for already-claimed quests. Sourced
  // from CoinTransaction rows the claim endpoint already writes, so this
  // adds zero extra state to track.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await homeService.getClaimStatus();
        if (cancelled) return;
        const already = Object.entries(status || {})
          .filter(([, claimed]) => claimed)
          .map(([kind]) => kind);
        if (already.length > 0) setClaimedKinds(already);
      } catch { /* ignore — badge just stays at "Claim!" */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const next = useCallback(() => setIndex((i) => (i + 1) % SLIDES.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length), []);
  const jump = useCallback((i) => setIndex(i), []);

  useEffect(() => {
    if (paused) return undefined;
    startRef.current = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= AUTO_INTERVAL_MS) {
        clearInterval(id);
        setIndex((i) => (i + 1) % SLIDES.length);
      }
    }, 200);
    return () => clearInterval(id);
  }, [index, paused]);

  const handleClaim = useCallback(async (kind) => {
    if (!kind || claimingKind) return;
    setClaimError(null);
    setClaimingKind(kind);
    try {
      await homeService.claimPlaceholder(kind);
      setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      try {
        await hydrate({});
      } catch { /* ignore — wallet will refresh on next mount */ }
    } catch (err) {
      // 409 from the backend means "already claimed today" — treat as
      // success (mark claimed) so the customer doesn't keep re-trying.
      if (err?.status === 409) {
        setClaimedKinds((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      } else {
        setClaimError(err?.message || 'Claim failed.');
      }
    } finally {
      setClaimingKind(null);
    }
  }, [claimingKind, hydrate]);

  return (
    <div
      className={`neog-app ${panelOpen ? 'panel-open' : 'panel-closed'}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="neog-bg" aria-hidden />

      <main className="neog-stage">
        <Carousel slide={SLIDES[index]} />
        <CarouselControls
          index={index}
          total={SLIDES.length}
          onPrev={prev}
          onNext={next}
          onJump={jump}
        />
      </main>

      <PanelToggle open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
      <RightPanel
        open={panelOpen}
        claimedKinds={claimedKinds}
        claimingKind={claimingKind}
        claimError={claimError}
        onClaim={handleClaim}
        happyHour={happyHour}
        learnMoreOpen={learnMoreOpen}
        onToggleLearnMore={() => setLearnMoreOpen((v) => !v)}
      />
    </div>
  );
}
