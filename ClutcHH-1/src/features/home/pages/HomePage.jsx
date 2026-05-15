 import { useState, useEffect } from "react";
  import { Link, useNavigate } from 'react-router-dom';
  import { ROUTES } from "@/app/routes/paths";
  import { gamesService, launch as launchGame } from '@/features/games/services/gamesService';
  import { listAnnouncements } from '@/features/notifications/services/announcementsService';
  import '../../../styles/Home.css';

  // Fallback for the brief initial paint before live data arrives.
  const GAMES_FALLBACK = [
    { id: 'placeholder', name: 'Loading…', genre: '', rating: 'T', players: '' },
  ];
  
  const NAV_ITEMS = [
    { label: "Home", path: ROUTES.home },
    { label: "Games & Apps", path: ROUTES.mainGames },
    { label: "Shop", path: ROUTES.mainShop },
    { label: "Rewards", path: ROUTES.mainPrizeVault },
  ];
  
  const QUESTS = [
    {
      id: "checkin",
      name: "Daily Check-In",
      sub: "Log in today",
      icon: "✓",
      iconColor: "green",
      pctColor: "green",
      fillWidth: "fill-w-100",
      progress: "1/1",
      xp: 50,
      coins: 25,
      claimable: true,
    },
    {
      id: "streak",
      name: "Streak Master",
      sub: "Log in 7 days in a row",
      icon: "🔥",
      iconColor: "orange",
      pctColor: "orange",
      fillWidth: "fill-w-86",
      pct: "86%",
      progress: "6/7 days",
      xp: 1000,
      coins: 750,
      claimable: false,
    },
    {
      id: "hour",
      name: "Hour Power",
      sub: "Spend at least 1 hour today",
      icon: "⏱",
      iconColor: "purple",
      pctColor: "purple",
      fillWidth: "fill-w-75",
      pct: "75%",
      progress: "45/60 min",
      xp: 75,
      coins: 50,
      claimable: false,
    },
  ];
  
  /* ═══════════════════════════════════════════
     LIVE TIMER HOOK
  ═══════════════════════════════════════════ */
  function useLiveTimer() {
    const [time, setTime] = useState({ h: 49, m: 2, s: 33 });
  
    useEffect(() => {
      const id = setInterval(() => {
        setTime((prev) => {
          let { h, m, s } = prev;
          s += 1;
          if (s >= 60) { s = 0; m += 1; }
          if (m >= 60) { m = 0; h += 1; }
          return { h, m, s };
        });
      }, 1000);
      return () => clearInterval(id);
    }, []);
  
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(time.h)}:${pad(time.m)}:${pad(time.s)}`;
  }
  
  /* ═══════════════════════════════════════════
     SVG ICONS — all self-contained, no inline styles
  ═══════════════════════════════════════════ */
  function LogoMark() {
    return (
      // <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
      //   <path d="M15 3L27 9.5v11L15 27 3 20.5v-11L15 3z" fill="#e8293a" opacity="0.92" />
      //   <path d="M15 7.5L24 12v8L15 24 6 20V12L15 7.5z" fill="#ff5a6a" opacity="0.45" />
      //   <path d="M15 12l5 2.5v5L15 22l-5-2.5v-5L15 12z" fill="white" opacity="0.88" />
      // </svg>
      <svg width="24" height="28" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.0001 26C12.0001 19.1428 8.57157 14 3.42871 7.14282" stroke="#E8364E" stroke-width="2.14286" stroke-linecap="round"/>
    <path d="M12 25.9999C12 17.4285 12 12.2856 12 5.42847" stroke="#E8364E" stroke-width="2.14286" stroke-linecap="round"/>
    <path d="M12 26C12 19.1428 15.4286 14 20.5714 7.14282" stroke="#E8364E" stroke-width="2.14286" stroke-linecap="round"/>
    <path d="M3.42871 10.1428C5.08557 10.1428 6.42871 8.79968 6.42871 7.14282C6.42871 5.48597 5.08557 4.14282 3.42871 4.14282C1.77186 4.14282 0.428711 5.48597 0.428711 7.14282C0.428711 8.79968 1.77186 10.1428 3.42871 10.1428Z" fill="#E8364E"/>
    <path d="M12 8.42847C13.6569 8.42847 15 7.08532 15 5.42847C15 3.77161 13.6569 2.42847 12 2.42847C10.3431 2.42847 9 3.77161 9 5.42847C9 7.08532 10.3431 8.42847 12 8.42847Z" fill="#E8364E"/>
    <path d="M20.5713 10.1428C22.2281 10.1428 23.5713 8.79968 23.5713 7.14282C23.5713 5.48597 22.2281 4.14282 20.5713 4.14282C18.9144 4.14282 17.5713 5.48597 17.5713 7.14282C17.5713 8.79968 18.9144 10.1428 20.5713 10.1428Z" fill="#E8364E"/>
  </svg>
    );
  }
  
  function IconPlay() {
    return (
      <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.3944 7.56577L2 3.30277V11.8287L8.3944 7.56577Z
    M11.376 7.98177L0.77735 15.0475C0.54759 15.2007 0.23715 15.1386 0.0839701 14.9089C0.0292201 
    14.8267 0 14.7302 0 14.6315V0.5C0 0.22385 0.22386 0 0.5 0C0.59871 0 0.69522 0.0292201 
    0.77735 0.0839701L11.376 7.14967C11.6057 7.30287 11.6678 7.61337 11.5146 7.84307C11.478 
    7.89797 11.4309 7.94517 11.376 7.98177Z" 
    fill="white"/>
  </svg>
    );
  }
  
  function IconSettings() {
    return (
     <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7.58579 2.8995L10.1924 0.292897C10.5829 -0.0976325 11.2161 -0.0976325 11.6066 0.292897L14.2132 
    2.8995H17.8995C18.4518 2.8995 18.8995 3.34722 18.8995 3.8995V7.58579L21.5061 10.1924C21.8966 10.5829 
    21.8966 11.2161 21.5061 11.6066L18.8995 14.2132V17.8995C18.8995 18.4518 18.4518 18.8995 17.8995 
    18.8995H14.2132L11.6066 21.5061C11.2161 21.8966 10.5829 21.8966 10.1924 21.5061L7.58579 18.8995H3.8995C3.34722 
    18.8995 2.8995 18.4518 2.8995 17.8995V14.2132L0.292897 11.6066C-0.0976325 11.2161 -0.0976325 10.5829 
    0.292897 10.1924L2.8995 7.58579V3.8995C2.8995 3.34722 3.34722 2.8995 3.8995 2.8995H7.58579Z
    M4.8995 4.8995V8.41422L2.41422 10.8995L4.8995 13.3848V16.8995H8.41422L10.8995 19.3848L13.3848 
    16.8995H16.8995V13.3848L19.3848 10.8995L16.8995 8.41422V4.8995H13.3848L10.8995 2.41422L8.41422 4.8995H4.8995Z
    M10.8995 14.8995C8.69036 14.8995 6.8995 13.1086 6.8995 10.8995C6.8995 8.69036 8.69036 6.8995 10.8995 
    6.8995C13.1086 6.8995 14.8995 8.69036 14.8995 10.8995C14.8995 13.1086 13.1086 14.8995 10.8995 14.8995Z
    M10.8995 12.8995C12.0041 12.8995 12.8995 12.0041 12.8995 10.8995C12.8995 9.79492 12.0041 8.89952 
    10.8995 8.89952C9.79492 8.89952 8.89952 9.79492 8.89952 10.8995C8.89952 12.0041 9.79492 12.8995 10.8995 12.8995Z" 
    fill="#9CA3AF"/>
  </svg>
    );
  }
  
  function IconBell() {
    return (
     <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 16H16V9.0314C16 5.14806 12.866 2 9 2C5.13401 2 2 5.14806 2 9.0314V16Z
    M9 0C13.9706 0 18 4.04348 18 9.0314V18H0V9.0314C0 4.04348 4.02944 0 9 0Z
    M6.5 19H11.5C11.5 20.3807 10.3807 21.5 9 21.5C7.6193 21.5 6.5 20.3807 6.5 19Z" 
    fill="#9CA3AF"/>
  </svg>
    );
  }
  
  function IconClock() {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8.00016 14.6666C4.31826 14.6666 1.3335 11.6818 1.3335 7.99992C1.3335 4.31802 
    4.31826 1.33325 8.00016 1.33325C11.682 1.33325 14.6668 4.31802 14.6668 7.99992C14.6668 
    11.6818 11.682 14.6666 8.00016 14.6666Z
    M8.00016 13.3333C10.9457 13.3333 13.3335 10.9455 13.3335 7.99992C13.3335 5.0544 10.9457 
    2.66659 8.00016 2.66659C5.05464 2.66659 2.66683 5.0544 2.66683 7.99992C2.66683 10.9455 
    5.05464 13.3333 8.00016 13.3333Z
    M8.66683 7.99992H11.3335V9.33325H7.3335V4.66658H8.66683V7.99992Z" 
    fill="#E8364E"/>
  </svg>
    );
  }
  
  function IconTrophy() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.0049 16.9411V19.0029H18.0049V21.0029H6.00488V19.0029H11.0049V16.9411C7.05857 
    16.449 4.00488 13.0826 4.00488 9.00293V3.00293H20.0049V9.00293C20.0049 13.0826 16.9512 
    16.449 13.0049 16.9411Z
    M6.00488 5.00293V9.00293C6.00488 12.3167 8.69117 15.0029 12.0049 15.0029C15.3186 15.0029 
    18.0049 12.3167 18.0049 9.00293V5.00293H6.00488Z
    M1.00488 5.00293H3.00488V9.00293H1.00488V5.00293Z
    M21.0049 5.00293H23.0049V9.00293H21.0049V5.00293Z" 
    fill="#9CA3AF"/>
  </svg>
    );
  }
  
  function IconSword() {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 
    22 12C22 17.5228 17.5228 22 12 22Z
    M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 
    16.4183 7.58172 20 12 20Z
    M15.5 8.5L13.5 13.5L8.5 15.5L10.5 10.5L15.5 8.5Z" 
    fill="#9CA3AF"/>
  </svg>
    );
  }
  
  function IconChevronRight() {
    return (
      <svg width="9" height="10" viewBox="0 0 9 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M3 1.5L6.5 5 3 8.5" />
      </svg>
    );
  }
  
  function IconChevronLeft() {
    return (
      <svg width="9" height="10" viewBox="0 0 9 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M6 1.5L2.5 5 6 8.5" />
      </svg>
    );
  }
  
  function IconGrid() {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <rect x="1" y="1" width="5" height="5" rx="1.5" />
        <rect x="8" y="1" width="5" height="5" rx="1.5" />
        <rect x="1" y="8" width="5" height="5" rx="1.5" />
        <rect x="8" y="8" width="5" height="5" rx="1.5" />
      </svg>
    );
  }
  
  function IconArrow() {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        <path d="M1 5.5h9M6 1.5l4 4-4 4" />
      </svg>
    );
  }
  
  /* ═══════════════════════════════════════════
     SUB-COMPONENTS
  ═══════════════════════════════════════════ */
  
  /* ─── Game Tile ─────────────────────────── */
  function GameTile({ game, isActive, onClick }) {
    return (
      <button
        className={`tile${isActive ? " tile--active" : ""}`}
        onClick={onClick}
        aria-pressed={isActive}
        aria-label={`Select ${game.name}`}
      >
        <div className="tile__cover" data-game={game.id} />
        <div className="tile__label">{game.name}</div>
      </button>
    );
  }
  
  /* ─── Quest Card ─────────────────────────── */
  function QuestCard({ quest }) {
    return (
      <div className="quest-card">
        <div className="quest-card__row">
          <div className={`quest-card__icon quest-card__icon--${quest.iconColor}`}>
            {quest.icon}
          </div>
  
          <div className="quest-card__info">
            <div className="quest-card__name">{quest.name}</div>
            <div className="quest-card__sub">{quest.sub}</div>
          </div>
  
          <div className="quest-card__right">
            {quest.claimable ? (
              <button className="btn-claim">Claim!</button>
            ) : (
              <>
                <span className={`quest-card__pct quest-card__pct--${quest.pctColor}`}>
                  {quest.pct}
                </span>
                <span className="quest-card__count">{quest.progress}</span>
              </>
            )}
          </div>
        </div>
  
        <div className="progress-bar__track">
          <div
            className={[
              "progress-bar__fill",
              `progress-bar__fill--${quest.pctColor}`,
              quest.fillWidth,
            ].join(" ")}
          />
        </div>
  
        <div className="quest-card__rewards">
          <div className="reward">
            <span className="reward__icon--xp">⚡</span>
            {quest.xp} XP
          </div>
          <div className="reward">
            <span className="reward__icon--coin">🪙</span>
            {quest.coins}
          </div>
        </div>
      </div>
    );
  }

  function HomePage() {
    const navigate = useNavigate();
    const [games, setGames] = useState(GAMES_FALLBACK);
    const [activeGame, setActiveGame] = useState(GAMES_FALLBACK[0]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [announcements, setAnnouncements] = useState([]);
    const [launchError, setLaunchError] = useState(null);
    const [launching, setLaunching] = useState(false);

    const [gamesLoaded, setGamesLoaded] = useState(false);

    useEffect(() => {
      let cancelled = false;
      gamesService.top(8).then((rows) => {
        if (cancelled) return;
        setGamesLoaded(true);
        if (rows.length) {
          setGames(rows);
          setActiveGame(rows[0]);
        } else {
          // No games configured by admin yet — show the empty-state tile
          // instead of looping on "Loading…".
          setGames([
            {
              id: 'empty',
              name: 'No games yet',
              genre: 'Ask your admin to add games in the admin panel.',
              launcher: null,
              rating: '—',
              players: '',
            },
          ]);
          setActiveGame({ id: 'empty', name: 'No games yet', launcher: null });
        }
      }).catch(() => {
        if (!cancelled) setGamesLoaded(true);
      });
      listAnnouncements().then((rows) => {
        if (!cancelled) setAnnouncements(rows.slice(0, 3));
      }).catch(() => {});
      return () => { cancelled = true; };
    }, []);

    const handleLaunch = async () => {
      if (
        launching ||
        !activeGame ||
        activeGame.id === 'placeholder' ||
        activeGame.id === 'empty'
      ) {
        return;
      }
      setLaunchError(null);
      setLaunching(true);
      try {
        await launchGame(activeGame);
      } catch (err) {
        setLaunchError(err?.message || 'Launch failed.');
      } finally {
        setLaunching(false);
      }
    };

  return (
      <div className="home-page">
      <div className="dashboard">
  
        {/* ── Background ─────────────────────────────── */}
        <div className="bg-layer" aria-hidden="true">
          <div className="bg-scene" data-game={activeGame.id} />
          <div className="bg-overlay" />
          <div className="bg-vignette" />
        </div>
  
        {/* ── Main Content ───────────────────────────── */}
        <div className="main">
  
          {/* ── Hero Section ─────────────────────────── */}
          <section className="hero" aria-label="Featured game">
  
            {/* Game Carousel */}
            <div className="carousel" role="list" aria-label="Game selector">
              {games.map((game) => (
                <GameTile
                  key={game.id}
                  game={game}
                  isActive={activeGame.id === game.id}
                  onClick={() => setActiveGame(game)}
                />
              ))}

              <button
                type="button"
                className="tile tile--all"
                aria-label="All games"
                onClick={() => navigate(ROUTES.mainGames)}
              >
                <IconGrid />
                <span>All Games</span>
              </button>
            </div>
  
            {/* Hero Info */}
            <div className="hero__bottom">
              <div className="hero__title-group">
                {/* <p className="hero__eyebrow">{activeGame.genre}</p> */}
                <h1 className="hero__title" key={activeGame.id}>
                  {activeGame.name}
                </h1>
                {/* <div className="hero__meta">
                  <span className="hero__badge">Rated {activeGame.rating}</span>
                  <span className="hero__meta-sep" aria-hidden="true" />
                  <span className="hero__badge">{activeGame.players} players</span>
                </div> */}
              </div>
  
              <div className="hero__actions">
                <button
                  type="button"
                  className="btn-launch"
                  onClick={handleLaunch}
                  disabled={launching || !activeGame || activeGame.id === 'placeholder'}
                  aria-label={`Launch ${activeGame.name}`}
                >
                  <span className="btn-launch__icon" aria-hidden="true">
                    <IconPlay />
                  </span>
                  {launching
                    ? 'Launching…'
                    : activeGame?.launcher
                      ? `Launch via ${activeGame.launcher}`
                      : 'Launch'}
                </button>
              </div>
              {launchError && (
                <div role="alert" style={{ color: '#fca5a5', fontSize: 12, marginTop: 6 }}>
                  {launchError}
                </div>
              )}

              <nav className="hero__links" aria-label="Game quick links">
                <Link className="hero__link" to={ROUTES.challenges}>
                  <IconTrophy />
                  Explore Challenges
                </Link>
                <Link className="hero__link" to={ROUTES.quests}>
                  <IconSword />
                  Explore Quests
                </Link>
              </nav>
            </div>
          </section>
  
          {/* ── Sidebar Toggle ───────────────────────── */}
          <div className="sidebar-toggle" aria-label="Toggle sidebar">
            <button
              className="sidebar-toggle__btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-expanded={sidebarOpen}
              aria-controls="right-sidebar"
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <IconChevronRight /> : <IconChevronLeft />}
            </button>
          </div>
  
          {/* ── Right Sidebar ────────────────────────── */}
          <aside
            id="right-sidebar"
            className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`}
            aria-label="Promotions and quests"
            aria-hidden={!sidebarOpen}
          >
  
            {/* Happy Hour Card */}
            <div className="hh-card" role="complementary" aria-label="Happy Hour promotion">
              <div className="hh-card__bubble-1" aria-hidden="true" />
              <div className="hh-card__bubble-2" aria-hidden="true" />
  
              <div className="hh-card__header">
                <h2 className="hh-card__title">Happy Hour: 2-5 PM</h2>
                <div className="hh-card__clock-wrap" aria-hidden="true">
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 
  22 12C22 17.5228 17.5228 22 12 22Z
  M12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 
  16.4183 7.58172 20 12 20Z
  M13 12H17V14H11V7H13V12Z" 
  fill="#E5E7EB"/>
</svg>
                </div>
              </div>
  
              <div className="hh-card__ring-wrap">
                <div className="hh-card__ring" aria-label="Active hours: 2 PM to 5 PM">
                  {/* <svg
                    className="hh-card__ring-svg"
                    viewBox="0 0 72 72"
                    width="72"
                    height="72"
                    aria-hidden="true"
                  >
                    <circle className="hh-card__ring-track" cx="36" cy="36" r="30" />
                    <circle className="hh-card__ring-fill"  cx="36" cy="36" r="30" />
                  </svg> */}
                  <svg 
                  className="hh-card__ring-svg"
                  width="120"
                    height="72"
                  viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg">
  <path d="M 20 110 A 90 90 0 0 1 200 110"
        fill="none" stroke="rgba(255,255,255,0.25)"
        stroke-width="12"/>
  <path d="M 20 110 A 90 90 0 0 1 75 27"
        fill="none" stroke="white"
        stroke-width="12"/>
</svg>
                  <div className="hh-card__ring-label">2 - 5 PM</div>
                </div>
              </div>
  
              <div className="hh-card__bonus">
                <span className="hh-card__bonus-pct">30% EXTRA</span>
                <span className="hh-card__bonus-sub">on all sessions</span>
              </div>
  
              <div className="hh-card__starts">
                <span className="hh-card__starts-dot" aria-hidden="true" />
                Starts in 53m
              </div>
  
              <div className="hh-card__footer">
                <button className="btn-learn">Learn More</button>
                <div className="hh-card__dots" aria-hidden="true">
                  <span className="hh-card__dot" />
                  <span className="hh-card__dot" />
                  <span className="hh-card__dot hh-card__dot--active" />
                </div>
              </div>
            </div>
  
            {/* Live announcements from admin */}
            {announcements.length > 0 && (
              <div className="quest-panel">
                <div className="quest-panel__header">
                  <h3 className="quest-panel__title">Announcements</h3>
                </div>
                {announcements.map((a) => (
                  <div key={a.id} className="quest-card">
                    <div className="quest-card__row">
                      <div className="quest-card__icon quest-card__icon--purple">📣</div>
                      <div className="quest-card__info">
                        <div className="quest-card__name">{a.title}</div>
                        <div
                          className="quest-card__sub"
                          dangerouslySetInnerHTML={{ __html: a.body }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Progress / Quest Panel (sample preview — live quests coming soon) */}
            <div className="quest-panel">
              <div className="quest-panel__header">
                <h3 className="quest-panel__title">Your quests</h3>
                <button
                  type="button"
                  className="quest-panel__view-all"
                  aria-label="View all quests"
                  onClick={() => navigate(ROUTES.quests)}
                >
                  View All <IconArrow />
                </button>
              </div>

              {QUESTS.map((quest) => (
                <QuestCard key={quest.id} quest={quest} />
              ))}
            </div>
  
          </aside>
        </div>
      </div>
      </div>
  );
  }
  export default HomePage;
 
