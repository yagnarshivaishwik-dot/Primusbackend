import '../../../styles/appsandgames.css';
import React, { useState } from 'react';

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_TAGS = [
  "All",
  "Multiplayer",
  "Shooter",
  "FPS",
  "Action",
  "Coop",
  "Strategy",
  "Battle Royale",
  "Adventure",
  "RPG",
  "Racing",
  "Sports",
];

const GAMES = [
  { id: 1, name: "Rocket League", badge: 1, colorClass: "game-img--rocket-league" },
  { id: 2, name: "Rivals",        badge: 2, colorClass: "game-img--rivals"        },
  { id: 3, name: "Counter-Strike 2", badge: 3, colorClass: "game-img--cs2"        },
  { id: 4, name: "Valorant",      badge: null, colorClass: "game-img--valorant"   },
  { id: 5, name: "Fortnite",      badge: null, colorClass: "game-img--fortnite"   },
  { id: 6, name: "Apex",          badge: null, colorClass: "game-img--apex"       },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function GameCover({ colorClass, name }) {
  return (
    <div className={`game-cover ${colorClass}`}>
      <span className="game-cover__title">{name}</span>
    </div>
  );
}

function GameCard({ game }) {
  const badgeLabel = game.badge ? `Top ${game.badge}` : null;

  return (
    <div className="game-card">
      <div className="game-card__image-wrapper">
        <GameCover colorClass={game.colorClass} name={game.name} />
        {badgeLabel && (
          <span className={`game-card__badge`}>
            {badgeLabel}
          </span>
        )}
      </div>
      <span className="game-card__name">{game.name}</span>
    </div>
  );
}

function GameSection({ title, badge, games }) {
  return (
    <div className="game-section">
      <div className="game-section__header">
        <div className="game-section__title-group">
          <h2 className="game-section__title">{title}</h2>
          {badge && <span className="free-badge">{badge}</span>}
        </div>
        <div className="game-section__nav">
          <button className="nav-arrow" aria-label="Previous">&#8249;</button>
          <button className="nav-arrow" aria-label="Next">&#8250;</button>
        </div>
      </div>
      <div className="games-grid">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}
function GameSectionAll({ title, badge, games }) {
  return (
    <div className="game-section gameAll-section">
      <div className="game-section__header">
        <div className="game-section__title-group">
          <h2 className="game-section__title">{title}</h2>
          {/* {badge && <span className="free-badge">{badge}</span>} */}
        </div>
        <div className="SelectOptions">
          <select>
            <option value="1" placeholder="Sort By">All Games</option>
          </select>
        </div>
      </div>
      <div className="games-grid">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
         {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
         {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
         {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}
function AppCard ({title}) {
  return (
    <div className='All-appsMain'>
      <div className='All-appstitle'>All Apps</div>
      <div className="all-appcard">
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon1">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon2">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon3">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon4">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon5">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon6">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon1">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon2">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon3">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon4">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon5">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
        <div className="app-card">
          <div className="app-card__icon-wrapper app-card_icon6">
          </div>
          <p className="app-card__subtitle">Guna</p>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ activeTag, onTagChange }) {
  const [freeToPlay, setFreeToPlay] = useState(true);

  return (
    <aside className="sidebar">
      {/* Search */}
      <div className="search">
        <div className="search__input-wrapper">
          <span className="search__icon">🔍</span>
          <input
            className="search__input"
            type="text"
            placeholder="Search games..."
          />
        </div>
      </div>

      {/* License */}
      <div className="sidebar__section">
        <p className="sidebar__label">License</p>
        <div className="license-toggle">
          <label className="toggle">
            <input
              className="toggle__input"
              type="checkbox"
              checked={freeToPlay}
              onChange={() => setFreeToPlay((v) => !v)}
            />
            <span className="toggle__slider" />
          </label>
          <span className="license-toggle__label">Free to play</span>
        </div>
      </div>

      {/* Browse by Tag */}
      <div className="sidebar__section">
        <p className="sidebar__label">Browse by Tag</p>
        <nav className="nav-tags">
          {NAV_TAGS.map((tag) => (
            <button
              key={tag}
              className={`nav-tag ${activeTag === tag ? "nav-tag--active" : ""}`}
              onClick={() => onTagChange(tag)}
            >
              {tag}
            </button>
          ))}
          <button className="nav-tag nav-tag--more">View more</button>
        </nav>
      </div>
    </aside>
  );
}

function Topbar() {
  const [activeTab, setActiveTab] = useState("Games");

  const tabs = [
    { label: "Games", count: 25, icon: "🎮" },
    { label: "Apps",  count: 15, icon: "⊞"  },
  ];

  return (
    <header className="topbar">
      {tabs.map(({ label, count, icon }) => (
        <button
          key={label}
          className={`topbar__tab ${activeTab === label ? "topbar__tab--active" : ""}`}
          onClick={() => setActiveTab(label)}
        >
          <span className="topbar__tab-icon">{icon}</span>
          {label} ({count})
        </button>
      ))}
    </header>
  );
}

function GamesandApps() {
const [activeTag, setActiveTag] = useState("All");

  return (
    <div className="app">
     
      <div className="main">
        <Sidebar activeTag={activeTag} onTagChange={setActiveTag} />
        <main className="content">
           <Topbar />
          <h1 className="page-title">Access your own games</h1>
          <GameSection title="Most played at ClutcHH" games={GAMES} />
          <GameSection title="Free to Play" badge="FREE" games={GAMES} />
          <GameSectionAll title="All Games" games={GAMES} />
          <AppCard title=" All Apps" />
        
        </main>
      </div>
    </div>
  );
};

export default GamesandApps;
