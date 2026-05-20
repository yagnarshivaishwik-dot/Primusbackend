import { useEffect, useMemo, useState } from 'react';
import { IoGameControllerOutline } from 'react-icons/io5';
import { TbApps } from 'react-icons/tb';
import { TbAppsOff } from 'react-icons/tb';

import { gamesService, launch as launchGame } from '@/features/games/services/gamesService';
import AppHeader from '@/components/layout/AppHeader';

import GameCarousel from './GameCarousel';
import './GamesPage.css';

/**
 * GamesPage — Pavan's NoLag visual shell wired to live catalog.
 *
 * Tabs ("Games" / "Apps") use React state (Pavan's source used CSS-only :checked
 * on hidden radios; React state fits cleaner with our routing). Data comes from
 * `gamesService.list()` and `gamesService.listApps()`; LAUNCH goes through the
 * native host bridge via `gamesService.launch()`.
 */

function deriveFilters(games) {
  const seen = new Set();
  const out = ['All'];
  for (const g of games) {
    for (const tag of g.tags || []) {
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
    }
    if (g.genre && !seen.has(g.genre)) {
      seen.add(g.genre);
      out.push(g.genre);
    }
  }
  return out;
}

export default function GamesPage() {
  const [tab, setTab] = useState('games');
  const [games, setGames] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
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

  const filters = useMemo(() => deriveFilters(games), [games]);

  const filteredGames = useMemo(() => {
    if (activeFilter === 'All') return games;
    return games.filter(
      (g) => (g.tags || []).includes(activeFilter) || g.genre === activeFilter,
    );
  }, [games, activeFilter]);

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
    <div className="gameContainer">
      <AppHeader />
      <div className="tabs">
        <button
          type="button"
          className={`tab-btn${tab === 'games' ? ' active' : ''}`}
          onClick={() => setTab('games')}
        >
          <IoGameControllerOutline /> Games
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'apps' ? ' active' : ''}`}
          onClick={() => setTab('apps')}
        >
          <TbApps /> Apps
        </button>
      </div>

      {loading && (
        <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center' }}>
          Loading catalog…
        </div>
      )}
      {error && !loading && (
        <div style={{ padding: 20, color: '#fca5a5', textAlign: 'center' }}>{error}</div>
      )}
      {launchError && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            margin: '8px auto',
            maxWidth: 600,
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {launchError}
        </div>
      )}

      {!loading && !error && tab === 'games' && (
        <div className="displaycontent gamescontent">
          <GameCarousel
            games={filteredGames}
            filters={filters}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onLaunch={handleLaunch}
            launchingId={launchingId}
          />
        </div>
      )}

      {!loading && !error && tab === 'apps' && (
        <div className="displaycontent appsontent">
          <div className="appswrapper">
            {apps.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  color: '#9CA3AF',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <TbAppsOff size={32} />
                No apps configured yet. Add apps in the admin panel (category: app).
              </div>
            ) : (
              <div className="appsgrid">
                {apps.map((app) => {
                  const isLaunching = launchingId === app.id;
                  return (
                    <button
                      key={app.id}
                      type="button"
                      className="appcard"
                      onClick={() => handleLaunch(app)}
                      disabled={isLaunching}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: isLaunching ? 'wait' : 'pointer',
                      }}
                      aria-label={`Launch ${app.name}`}
                    >
                      {app.logo ? (
                        <div
                          className="iconbox"
                          style={{
                            backgroundImage: `url(${app.logo})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                      ) : (
                        <div className="iconbox">
                          <TbApps />
                        </div>
                      )}
                      <div className="appname">{app.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
