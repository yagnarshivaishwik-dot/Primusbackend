import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Badge, Button, Card } from '@/components/common';
import { invoke, hasBridge } from '@/app/bridge/invoke';
import { ROUTES } from '@/app/routes/paths';

/**
 * System inspector: runs the native bridge scans (`detect_installed_games`
 * and `detect_installed_apps`) and shows every executable the host side
 * found, plus the distinct launcher set derived from those rows.
 *
 * Used for quick "what's this PC actually going to launch" verification
 * when an admin is debugging the Games page or the launch flow.
 */
export default function InstalledPage() {
  const [games, setGames] = useState(null);
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const scan = async () => {
    if (!hasBridge()) {
      setError('This page requires the PrimusKiosk host; open it on the kiosk PC.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [g, a] = await Promise.all([
        invoke('detect_installed_games').catch(() => []),
        invoke('detect_installed_apps').catch(() => []),
      ]);
      setGames(Array.isArray(g) ? g : []);
      setApps(Array.isArray(a) ? a : []);
    } catch (err) {
      setError(err?.message || 'Scan failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
  }, []);

  const launcherSet = new Set();
  (games || []).forEach((g) => g.launcher && launcherSet.add(g.launcher));
  (apps || []).forEach((a) => a.launcher && launcherSet.add(a.launcher));
  const launchers = Array.from(launcherSet).sort();

  return (
    <PlaceholderPage
      title="Installed on this PC"
      subtitle="Live scan of games + apps detected by the host"
      backTo={ROUTES.settingsHelp}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Button onClick={scan} disabled={loading}>
          {loading ? 'Scanning…' : 'Re-scan'}
        </Button>
      </div>

      {error && (
        <Card>
          <div style={{ color: '#fca5a5' }}>{error}</div>
        </Card>
      )}

      {!error && (
        <>
          <Card title="Detected launchers" subtitle={`${launchers.length} unique`}>
            {launchers.length === 0 ? (
              <div style={{ color: '#9CA3AF', fontSize: 13 }}>
                No launchers resolved yet. Either nothing installed or the scan hasn't finished.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {launchers.map((l) => (
                  <Badge key={l} tone="info">{l}</Badge>
                ))}
              </div>
            )}
          </Card>

          <div style={{ height: 16 }} />

          <Card title="Games" subtitle={`${games?.length ?? 0} detected`}>
            {loading && !games && <div style={{ color: '#9CA3AF' }}>Scanning…</div>}
            {!loading && (games?.length ?? 0) === 0 && (
              <div style={{ color: '#9CA3AF', fontSize: 13 }}>
                No games detected. Configure game catalog entries in the admin panel
                (they don't need to be installed locally to appear here).
              </div>
            )}
            {(games?.length ?? 0) > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E5E7EB', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#9CA3AF' }}>
                      <th style={{ padding: 8 }}>Name</th>
                      <th style={{ padding: 8 }}>Category</th>
                      <th style={{ padding: 8 }}>Executable</th>
                      <th style={{ padding: 8 }}>Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.id ?? g.name} style={{ borderTop: '1px solid #374151' }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{g.name}</td>
                        <td style={{ padding: 8 }}>{g.category || '—'}</td>
                        <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
                          {g.executable_path || '—'}
                        </td>
                        <td style={{ padding: 8 }}>
                          <Badge tone={g.enabled ? 'success' : 'muted'}>
                            {g.enabled ? 'yes' : 'no'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div style={{ height: 16 }} />

          <Card title="Apps" subtitle={`${apps?.length ?? 0} detected`}>
            {loading && !apps && <div style={{ color: '#9CA3AF' }}>Scanning…</div>}
            {!loading && (apps?.length ?? 0) === 0 && (
              <div style={{ color: '#9CA3AF', fontSize: 13 }}>
                No apps detected. Admin-configured entries with category=app show here once saved.
              </div>
            )}
            {(apps?.length ?? 0) > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E5E7EB', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#9CA3AF' }}>
                      <th style={{ padding: 8 }}>Name</th>
                      <th style={{ padding: 8 }}>Category</th>
                      <th style={{ padding: 8 }}>Executable</th>
                      <th style={{ padding: 8 }}>Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.map((a) => (
                      <tr key={a.id ?? a.name} style={{ borderTop: '1px solid #374151' }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{a.name}</td>
                        <td style={{ padding: 8 }}>{a.category || '—'}</td>
                        <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>
                          {a.executable_path || '—'}
                        </td>
                        <td style={{ padding: 8 }}>
                          <Badge tone={a.enabled ? 'success' : 'muted'}>
                            {a.enabled ? 'yes' : 'no'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </PlaceholderPage>
  );
}
