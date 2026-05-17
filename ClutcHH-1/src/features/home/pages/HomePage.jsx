import React, { useState, useEffect, useRef, useCallback } from "react";
import "../../../styles/homepage.css";

/* ============================================================
   NeoG Dashboard
   - Auto-advancing carousel (pause on hover, reset on manual nav)
   - Left content over gradient bg + right media (image + video overlay)
   - Bottom-right controls: page counter, dots, arrows, progress bar
   - Glass right panel toggled via edge arrow
============================================================ */

const AUTO_INTERVAL_MS = 7000;

/* ---------- Inline SVG icons ---------- */
const I = {
  Play: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Gear: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.1 16.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  ChevronDown: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
      <polyline points="6 9 12 15 18 9" />
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
  Home: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  Grid: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  Bag: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
      <path d="M6 7h12l-1 13H7L6 7z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  ),
  Trophy: (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" {...p}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
    </svg>
  ),
  Bolt: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  Pause: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  PlayFill: (p) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...p}>
      <path d="M7 5v14l12-7z" />
    </svg>
  ),
};

/* ---------- Slide data ----------
   videoSrc: replace these with your actual trailer files.
   The image acts as the poster while the video loads / if it fails.
*/
const SLIDES = [
  {
    id: "neonblade",
    tag: "NEONBLADE",
    subtitle: "CYBER COMBAT ARENA",
    title: ["NEON", "BLADE"],
    cta: "LAUNCH VIA EPIC",
    tags: ["CYBERPUNK", "PVP ARENA", "4V4"],
    leftBg:
      "radial-gradient(120% 80% at 0% 0%, #16223c 0%, #0a1124 45%, #06091a 100%)",
    media:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1600&q=80&auto=format&fit=crop",
    videoSrc:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    id: "valorshift",
    tag: "VALORSHIFT",
    subtitle: "TACTICAL FPS",
    title: ["VALOR", "SHIFT"],
    cta: "LAUNCH VIA STEAM",
    tags: ["TACTICAL", "5V5", "RANKED"],
    leftBg:
      "radial-gradient(120% 80% at 0% 0%, #3a1830 0%, #1a0a1a 45%, #08050d 100%)",
    media:
      "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1600&q=80&auto=format&fit=crop",
    videoSrc:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  {
    id: "stormrift",
    tag: "STORMRIFT",
    subtitle: "MOBA UNIVERSE",
    title: ["STORM", "RIFT"],
    cta: "LAUNCH NOW",
    tags: ["MOBA", "STRATEGY", "5V5"],
    leftBg:
      "radial-gradient(120% 80% at 0% 0%, #0e2f30 0%, #061a1c 45%, #03090e 100%)",
    media:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1600&q=80&auto=format&fit=crop",
    videoSrc:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
];

/* ---------- Quests data ---------- */
const QUESTS = [
  {
    id: "checkin",
    icon: <I.Check />,
    color: "#8B5CF6",
    title: "Daily Check-In",
    desc: "Log in today",
    xp: 50,
    coins: 25,
    progressLabel: "1/1",
    claimable: true,
    percent: 100,
  },
  {
    id: "streak",
    icon: <I.Flame />,
    color: "#7C3AED",
    title: "Streak Master",
    desc: "Log in 7 days in a row",
    xp: 1000,
    coins: 25,
    progressLabel: "6/7 days",
    percent: 86,
  },
  {
    id: "hour",
    icon: <I.Clock />,
    color: "#D946EF",
    title: "Hour Power",
    desc: "Spend at least 1 hour today",
    xp: 75,
    coins: 50,
    progressLabel: "45/60 min",
    percent: 75,
  },
];


/* ============================================================
   Carousel — left content + right media (image + video overlay)
============================================================ */
function Carousel({ slide }) {
  return (
    <section className="neog-carousel" key={slide.id}>
      {/* LEFT — content over gradient */}
      <div
        className="neog-carousel__left"
        style={{ background: slide.leftBg }}
      >
        <div className="neog-carousel__left-inner">
          <div className="neog-tagrow">
            <span className="neog-pill">{slide.tag}</span>
            <span className="neog-subtitle">{slide.subtitle}</span>
          </div>

          <h1 className="neog-title">
            {slide.title.map((line, i) => (
              <span key={i} className="neog-title__line">
                {line}
              </span>
            ))}
          </h1>

          <button className="neog-cta">
            <I.Play /> {slide.cta}
          </button>

          <ul className="neog-links">
            <li>
              <I.Diamond style={{ color: "#ff6b35" }} /> EXPLORE CHALLENGES
            </li>
            <li>
              <I.Spark style={{ color: "#ff6b35" }} /> EXPLORE QUESTS
            </li>
          </ul>

          <div className="neog-chips">
            {slide.tags.map((t) => (
              <span key={t} className="neog-chip">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — background image + video layered on top */}
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

          {/* <button className="neog-watch-trailer" aria-label="Watch trailer">
            <span className="neog-watch-trailer__play">
              <I.Play />
            </span>
            <span>WATCH TRAILER</span>
          </button> */}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Carousel Controls (bottom-right)
   - Page counter "01 / 03"
   - Dots
   - Arrows
   - Progress bar above (auto-advance indicator)
   - Play / pause button
============================================================ */
function CarouselControls({
  index,
  total,
  onPrev,
  onNext,
  onJump,
  progress,
  paused,
  onTogglePause,
}) {
  return (
    <div className="neog-carousel-controls">
      {/* <div className="neog-carousel-controls__progress">
        <div
          className="neog-carousel-controls__progress-fill"
          style={{ width: `${paused ? 0 : progress}%` }}
        />
      </div> */}

      <div className="neog-carousel-controls__row">
        {/* <div className="neog-pagecount">
          <span className="neog-pagecount__current">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="neog-pagecount__sep">/</span>
          <span className="neog-pagecount__total">
            {String(total).padStart(2, "0")}
          </span>
        </div> */}

        <div className="neog-dots" role="tablist">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              className={`neog-dot ${i === index ? "is-active" : ""}`}
              onClick={() => onJump(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <div className="neog-carousel-arrows glass">
          {/* <button
            className="neog-arrowbtn"
            onClick={onTogglePause}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <I.PlayFill /> : <I.Pause />}
          </button> */}
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
   Right Panel — collapsible glass
============================================================ */
function RightPanel({ open }) {
  return (
    <aside className={`neog-rightpanel ${open ? "is-open" : "is-closed"} glass`}>
      {/* Happy Hour card */}
      <div className="neog-hh">
        <div className="neog-hh__head">
          <span className="neog-hh__title">Happy Hour: 2-5 PM</span>
          <span className="neog-hh__clock"><I.Clock /></span>
        </div>

        <div className="neog-hh__arc">
          <svg viewBox="0 0 200 110" className="neog-hh__arc-svg">
            <path
              d="M20,100 A80,80 0 0,1 180,100"
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="6 8"
            />
            <path
              d="M20,100 A80,80 0 0,1 180,100"
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray="180 251"
            />
          </svg>
          <span className="neog-hh__arc-label">2 – 5 PM</span>
        </div>

        <div className="neog-hh__pct">
          <span className="neog-hh__pct-num">30%</span>
          <span className="neog-hh__pct-text">EXTRA on all sessions</span>
        </div>

        <div className="neog-hh__meta">
          <span className="neog-hh__meta-dot" />
          Starts in 53m
        </div>

        <div className="neog-hh__footer">
          <button className="neog-hh__btn">Learn More</button>
          <div className="neog-hh__dots">
            <span className="neog-hh__dot is-active" />
            <span className="neog-hh__dot" />
            <span className="neog-hh__dot" />
          </div>
        </div>
      </div>

      <h3 className="neog-section-title">Almost there!</h3>

      <ul className="neog-quests">
        {QUESTS.map((q) => (
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
                {q.claimable ? (
                  <span className="neog-quest__claim">Claim!</span>
                ) : (
                  <span className="neog-quest__pct">{q.percent}%</span>
                )}
              </div>
              <div className="neog-quest__desc">{q.desc}</div>
              <div className="neog-quest__rewards">
                <span className="neog-reward">
                  <I.Spark style={{ color: "#ff6b35" }} /> {q.xp} XP
                </span>
                <span className="neog-reward">
                  <I.Coin style={{ color: "#ff6b35" }} /> {q.coins}
                </span>
                <span className="neog-quest__progress">{q.progressLabel}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/* ============================================================
   Right Panel Toggle (edge arrow)
============================================================ */
function PanelToggle({ open, onClick }) {
  return (
    <button
      className={`neog-paneltoggle ${open ? "is-open" : ""}`}
      onClick={onClick}
      aria-label={open ? "Close panel" : "Open panel"}
      aria-expanded={open}
    >
      {open ? <I.ChevronRight /> : <I.ChevronLeft />}
    </button>
  );
}


/* ============================================================
   Root component
============================================================ */
export default function LoginPage() {
  const [index, setIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(Date.now());

  const next = useCallback(
    () => setIndex((i) => (i + 1) % SLIDES.length),
    []
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length),
    []
  );
  const jump = useCallback((i) => setIndex(i), []);

  /* Auto-advance + progress ticker.
     Restarts whenever index changes (manual nav resets the timer). */
  useEffect(() => {
    if (paused) return undefined;

    startRef.current = Date.now();
    setProgress(0);

    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= AUTO_INTERVAL_MS) {
        clearInterval(id);
        setIndex((i) => (i + 1) % SLIDES.length);
      } else {
        setProgress((elapsed / AUTO_INTERVAL_MS) * 100);
      }
    }, 60);

    return () => clearInterval(id);
  }, [index, paused]);

  return (
    <div className={`neog-app ${panelOpen ? "panel-open" : "panel-closed"}`}>
      <div className="neog-bg" aria-hidden />

      {/* <TopNav /> */}

      <main className="neog-stage">
        <Carousel slide={SLIDES[index]} />
        <CarouselControls
          index={index}
          total={SLIDES.length}
          onPrev={prev}
          onNext={next}
          onJump={jump}
          // progress={progress}
          // paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
        />
      </main>

      <PanelToggle open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
      <RightPanel open={panelOpen} />

      {/* <BottomNav /> */}
    </div>
  );
}
