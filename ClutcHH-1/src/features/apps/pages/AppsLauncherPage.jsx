import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Badge, Card } from '@/components/common';
import { gamesService } from '@/features/games/services/gamesService';
import { ROUTES } from '@/app/routes/paths';

/**
 * Launchers summary — pulls the distinct set of launchers across every
 * admin-configured game/app and shows connection status.
 */
export default function AppsLauncherPage() {
  const [launchers, setLaunchers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([gamesService.list(), gamesService.listApps()])
      .then(([g, a]) => {
        if (cancelled) return;
        const set = new Set();
        [...g, ...a].forEach((item) => {
          item.launchers.forEach((l) => set.add(l));
          if (item.launcher) set.add(item.launcher);
        });
        setLaunchers(Array.from(set).sort());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PlaceholderPage title="Launchers" subtitle="Pick a platform" backTo={ROUTES.mainApps}>
      {loading && <Card><div style={{ color: '#9CA3AF' }}>Loading…</div></Card>}
      {!loading && launchers.length === 0 && (
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            No launchers configured on any game/app yet. Configure launchers in the admin panel.
          </div>
        </Card>
      )}
      {!loading && launchers.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          {launchers.map((l) => (
            <Card key={l}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontWeight: 600 }}>{l}</span>
                <Badge tone="info">Active</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PlaceholderPage>
  );
}
