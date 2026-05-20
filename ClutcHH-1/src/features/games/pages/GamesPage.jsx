import { useEffect, useMemo, useState } from 'react';
import { IoGameControllerOutline } from 'react-icons/io5';
import { TbApps } from 'react-icons/tb';
import { TbAppsOff } from 'react-icons/tb';

import { gamesService, launch as launchGame, adminCreateDetected } from '@/features/games/services/gamesService';
import { invoke, hasBridge } from '@/app/bridge/invoke';
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
  // "Add games from this PC" modal state. The flow:
  //   1. User clicks the "+ Add games from this PC" button → modal opens
  //   2. Modal triggers the C# bridge `detect_installed_games` and
  //      `detect_installed_apps`, presents a checkbox list
  //   3. Admin enters their credentials at the bottom
  //   4. Submit → /api/v1/games/admin-create-detected creates the rows
  // The customer's JWT keeps driving everything else — admin creds are
  // a one-shot authorisation, not a session swap.
  const [addOpen, setAddOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState([]);     // [{name, exe_path, category, selected}]
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addResult, setAddResult] = useState(null); // { created: [...], skipped: [...] }
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

  const openAddModal = async () => {
    setAddOpen(true);
    setAddError(null);
    setAddResult(null);
    setAdminEmail('');
    setAdminPassword('');
    setDetected([]);
    if (!hasBridge()) {
      setAddError('Game scanning is only available on the kiosk host.');
      return;
    }
    setDetecting(true);
    try {
      // Scan local Steam / Epic / Riot / Battle.net / etc folders. The
      // C# bridge already aggregates these via GameRegistryScanner.
      const [scanGames, scanApps] = await Promise.all([
        invoke('detect_installed_games').catch(() => []),
        invoke('detect_installed_apps').catch(() => []),
      ]);
      // Tag with the kiosk's canonical category buckets BEFORE merging.
      // The bridge returns category="Steam"/"Local"/"Epic"/... — the
      // launcher name, not the catalog filter. /api/v1/games?category=game
      // is what the kiosk UI lists by, so normalize here.
      const taggedGames = (scanGames || []).map((g) => ({
        ...g,
        launcher: g.launcher || g.category || null,
        category: 'game',
      }));
      const taggedApps = (scanApps || []).map((g) => ({
        ...g,
        launcher: g.launcher || g.category || null,
        category: 'app',
      }));
      const combined = [...taggedGames, ...taggedApps];
      // Dedupe by name in case a launcher reports the same title twice.
      const byName = new Map();
      for (const g of combined) {
        if (g && g.name && !byName.has(g.name)) {
          byName.set(g.name, { ...g, selected: true });
        }
      }
      setDetected(Array.from(byName.values()));
    } catch (err) {
      setAddError(err?.message || 'Failed to scan installed games.');
    } finally {
      setDetecting(false);
    }
  };

  const closeAddModal = () => {
    setAddOpen(false);
    setDetected([]);
    setAddError(null);
    setAddResult(null);
    setAdminEmail('');
    setAdminPassword('');
  };

  const toggleDetected = (name) => {
    setDetected((prev) =>
      prev.map((g) => (g.name === name ? { ...g, selected: !g.selected } : g)),
    );
  };

  const handleAddSubmit = async () => {
    if (adding) return;
    setAddError(null);
    const selected = detected.filter((g) => g.selected);
    if (selected.length === 0) {
      setAddError('Pick at least one game / app to add.');
      return;
    }
    if (!adminEmail.trim() || !adminPassword) {
      setAddError('Admin email and password are required.');
      return;
    }
    setAdding(true);
    try {
      const result = await adminCreateDetected({
        adminEmail: adminEmail.trim(),
        adminPassword,
        games: selected,
      });
      setAddResult(result);
      // Refetch the catalog so the just-added games appear on the page.
      try {
        const [g, a] = await Promise.all([gamesService.list(), gamesService.listApps()]);
        setGames(g);
        setApps(a);
      } catch { /* ignore refetch hiccup */ }
    } catch (err) {
      setAddError(err?.message || 'Failed to add games.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="gameContainer">
      <AppHeader />
      <div className="tabs-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
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
        <button
          type="button"
          onClick={openAddModal}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add games from this PC
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

      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeAddModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(640px, 100%)',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'linear-gradient(180deg, rgba(20,22,28,0.95), rgba(12,14,20,0.95))',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
              color: '#fff',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700 }}>Add games from this PC</div>
              <button
                type="button"
                onClick={closeAddModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9CA3AF',
                  fontSize: 22,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '14px 20px', overflowY: 'auto', flex: 1 }}>
              {detecting && (
                <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center' }}>
                  Scanning installed games and apps…
                </div>
              )}

              {!detecting && detected.length === 0 && !addResult && (
                <div style={{ padding: 20, color: '#9CA3AF', textAlign: 'center', fontSize: 13 }}>
                  No installed games detected. Make sure Steam / Epic / Riot launchers are installed.
                </div>
              )}

              {!detecting && detected.length > 0 && !addResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>
                    {detected.filter((g) => g.selected).length} of {detected.length} selected
                  </div>
                  {detected.map((g) => (
                    <label
                      key={g.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: g.selected ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!g.selected}
                        onChange={() => toggleDetected(g.name)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#9CA3AF',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {(g.executable_path || g.exe_path || '—')}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.06)',
                          color: '#9CA3AF',
                          textTransform: 'uppercase',
                        }}
                      >
                        {g.category || 'game'}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {addResult && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    color: '#86efac',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Added {(addResult.created || []).length} game(s).
                  </div>
                  {(addResult.skipped || []).length > 0 && (
                    <div style={{ color: '#9CA3AF', fontSize: 12 }}>
                      Skipped {(addResult.skipped || []).length} duplicate(s).
                    </div>
                  )}
                </div>
              )}

              {!addResult && detected.length > 0 && !detecting && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                    Admin credentials are required to add games to this kiosk.
                  </div>
                  <input
                    type="email"
                    placeholder="Admin email"
                    autoComplete="off"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Admin password"
                    autoComplete="new-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: 13,
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {addError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#fca5a5',
                    fontSize: 13,
                  }}
                >
                  {addError}
                </div>
              )}
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={closeAddModal}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {addResult ? 'Done' : 'Cancel'}
              </button>
              {!addResult && (
                <button
                  type="button"
                  onClick={handleAddSubmit}
                  disabled={adding || detecting || detected.length === 0}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 999,
                    background: adding ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.9)',
                    border: '1px solid rgba(99,102,241,0.6)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: adding ? 'wait' : 'pointer',
                    opacity: detected.length === 0 ? 0.5 : 1,
                  }}
                >
                  {adding ? 'Adding…' : 'Add selected'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
