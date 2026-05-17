import { useEffect, useMemo, useState } from 'react';
import { gamesService, launch as launchGame } from '@/features/games/services/gamesService';
import '../../../styles/appsandgames.css';

// Static tag list used for filtering. Tags we actually highlight come from
// the live game list; anything the admin tags a game with will match here.
const NAV_TAGS = [
  'All', 'Multiplayer', 'Shooter', 'FPS', 'Action', 'Coop',
  'Strategy', 'Battle Royale', 'Adventure', 'RPG', 'Racing', 'Sports',
];

// Deterministic colour class so every game gets a consistent cover bg.
const COLOR_CLASSES = [
  'game-img--rocket-league',
  'game-img--rivals',
  'game-img--cs2',
  'game-img--valorant',
  'game-img--fortnite',
  'game-img--apex',
];
function colorFor(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return COLOR_CLASSES[Math.abs(h) % COLOR_CLASSES.length];
}

function GameCover({ game }) {
  if (game.imagePortrait) {
    return (
      <div className="game-cover" style={{ backgroundImage: `url(${game.imagePortrait})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <span className="game-cover__title">{game.name}</span>
      </div>
    );
  }
  return (
    <div className={`game-cover ${colorFor(game.id)}`}>
      <span className="game-cover__title">{game.name}</span>
    </div>
  );
}

function GameCard({ game, onLaunch, launching }) {
  return (
    <button
      type="button"
      className="game-card"
      onClick={() => onLaunch(game)}
      disabled={launching}
      aria-label={`Launch ${game.name}`}
      style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
    >
      <div className="game-card__image-wrapper">
        <GameCover game={game} />
        {game.badge != null && <span className="game-card__badge">Top {game.badge}</span>}
      </div>
      <span className="game-card__name">{game.name}</span>
    </button>
  );
}

function AppCard({ app, onLaunch, launching }) {
  return (
    <button
      type="button"
      className="app-card"
      onClick={() => onLaunch(app)}
      disabled={launching}
      aria-label={`Launch ${app.name}`}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      {app.logo ? (
        <div
          className="app-card__icon-wrapper"
          style={{ backgroundImage: `url(${app.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ) : (
        <div className={`app-card__icon-wrapper app-card_icon${(Math.abs(hashStr(app.id)) % 6) + 1}`} />
      )}
      <p className="app-card__subtitle">{app.name}</p>
    </button>
  );
}

function hashStr(s) {
  const str = String(s ?? '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

function Sidebar({ search, onSearch, activeTag, onTagChange, freeOnly, onFreeOnlyChange }) {
  return (
    <aside className="sidebar">
      <div className="search">
        <div className="search__input-wrapper">
          <span className="search__icon">🔍</span>
          <input
            className="search__input"
            type="text"
            placeholder="Search games…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="sidebar__section">
        <p className="sidebar__label">License</p>
        <div className="license-toggle">
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={freeOnly}
              onChange={() => onFreeOnlyChange(!freeOnly)}
            />
            <span className="toggle__slider" />
          </label>
          <span className="license-toggle__label">Free to play</span>
        </div>
      </div>

      <div className="sidebar__section">
        <p className="sidebar__label">Browse by Tag</p>
        <nav className="nav-tags">
          {NAV_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`nav-tag ${activeTag === tag ? 'nav-tag--active' : ''}`}
              onClick={() => onTagChange(tag)}
            >
              {tag}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function Topbar({ activeTab, onTabChange, counts }) {
  const tabs = [
    { label: 'Games', count: counts.games, icon: '🎮' },
    { label: 'Apps', count: counts.apps, icon: '⊞' },
  ];
  return (
    <header className="topbar">
      {tabs.map(({ label, count, icon }) => (
        <button
          key={label}
          type="button"
          className={`topbar__tab ${activeTab === label ? 'topbar__tab--active' : ''}`}
          onClick={() => onTabChange(label)}
        >
          <span className="topbar__tab-icon">{icon}</span>
          {label} ({count})
        </button>
      ))}
    </header>
  );
}

function GameSection({ title, badge, games, onLaunch, launchingId }) {
  if (games.length === 0) return null;
  return (
    <div className="game-section">
      <div className="game-section__header">
        <div className="game-section__title-group">
          <h2 className="game-section__title">{title}</h2>
          {badge && <span className="free-badge">{badge}</span>}
        </div>
      </div>
      <div className="games-grid">
        {games.map((g) => (
          <GameCard key={g.id} game={g} onLaunch={onLaunch} launching={launchingId === g.id} />
        ))}
      </div>
    </div>
  );
}

export default function GamesAndAppsPage() {
  const [tab, setTab] = useState('Games');
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('All');
  const [freeOnly, setFreeOnly] = useState(false);
  const [games, setGames] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [launchingId, setLaunchingId] = useState(null);
  const [launchError, setLaunchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [g, a] = await Promise.all([gamesService.list(), gamesService.listApps()]);
        if (cancelled) return;
        setGames(g);
        setApps(a);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      if (freeOnly && !g.free) return false;
      if (activeTag !== 'All' && !g.tags.includes(activeTag) && g.genre !== activeTag) return false;
      if (q && !g.name.toLowerCase().includes(q) && !g.genre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [games, freeOnly, activeTag, search]);

  const filteredApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [apps, search]);

  const freeGames = useMemo(() => filteredGames.filter((g) => g.free), [filteredGames]);
  const topGames = useMemo(
    () => [...filteredGames].sort((a, b) => (a.badge ?? 99) - (b.badge ?? 99)).slice(0, 8),
    [filteredGames],
  );

  const handleLaunch = async (item) => {
    if (launchingId) return;
    setLaunchError(null);
    setLaunchingId(item.id);
    try {
      await launchGame(item);
    } catch (err) {
      setLaunchError(err?.message || 'Launch failed.');
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <div className="games-page">
      <div className="app">
        <div className="main">
          <Sidebar
            search={search}
            onSearch={setSearch}
            activeTag={activeTag}
            onTagChange={setActiveTag}
            freeOnly={freeOnly}
            onFreeOnlyChange={setFreeOnly}
          />
          <main className="content">
            <Topbar
              activeTab={tab}
              onTabChange={setTab}
              counts={{ games: filteredGames.length, apps: filteredApps.length }}
            />
            <h1 className="page-title">
              {tab === 'Games' ? 'Access your own games' : 'Apps and tools'}
            </h1>

            {loading && (
              <div style={{ padding: 20, color: '#9CA3AF' }}>Loading catalog…</div>
            )}
            {error && !loading && (
              <div style={{ padding: 20, color: '#fca5a5' }}>{error}</div>
            )}
            {launchError && (
              <div role="alert" style={{ padding: '8px 12px', margin: '8px 0', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13 }}>
                {launchError}
              </div>
            )}

            {!loading && !error && tab === 'Games' && (
              <>
                <GameSection
                  title="Most played at NoLag"
                  title="Most played at ClutcHH"
                  games={topGames}
                  onLaunch={handleLaunch}
                  launchingId={launchingId}
                />
                <GameSection
                  title="Free to Play"
                  badge="FREE"
                  games={freeGames}
                  onLaunch={handleLaunch}
                  launchingId={launchingId}
                />
                <GameSection
                  title="All Games"
                  games={filteredGames}
                  onLaunch={handleLaunch}
                  launchingId={launchingId}
                />
                {filteredGames.length === 0 && (
                  <div style={{ padding: 20, color: '#9CA3AF' }}>
                    No games match these filters. Ask an admin to add games in the admin panel, or clear filters.
                  </div>
                )}
              </>
            )}

            {!loading && !error && tab === 'Apps' && (
              <div className="All-appsMain">
                <div className="All-appstitle">All Apps</div>
                <div className="all-appcard">
                  {filteredApps.length === 0 && (
                    <div style={{ color: '#9CA3AF', padding: 12 }}>
                      No apps configured yet. Add apps in the admin panel (category: app).
                    </div>
                  )}
                  {filteredApps.map((a) => (
                    <AppCard key={a.id} app={a} onLaunch={handleLaunch} launching={launchingId === a.id} />
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
