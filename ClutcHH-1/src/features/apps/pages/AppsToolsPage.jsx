import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { appsService, launch } from '@/features/apps/services/appsService';
import { ROUTES } from '@/app/routes/paths';

/**
 * Apps → Tools subset — any app whose tag/category includes "Tools" or
 * "Streaming". Renders directly from the live admin-configured catalog.
 */
export default function AppsToolsPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [launchingId, setLaunchingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    appsService
      .list()
      .then((rows) => {
        if (cancelled) return;
        const tools = rows.filter((a) =>
          ['tools', 'streaming'].some(
            (t) => a.category?.toLowerCase() === t || a.tags.map(String).map((s) => s.toLowerCase()).includes(t),
          ),
        );
        setApps(tools);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load tools.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLaunch = async (app) => {
    if (launchingId) return;
    setLaunchingId(app.id);
    try {
      await launch(app);
    } catch {
      /* surfaced as row-level state in future iterations */
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <PlaceholderPage
      title="Tools"
      subtitle={`${apps.length} available`}
      backTo={ROUTES.mainApps}
    >
      {loading && <Card><div style={{ color: '#9CA3AF' }}>Loading tools…</div></Card>}
      {error && !loading && <Card><div style={{ color: '#fca5a5' }}>{error}</div></Card>}
      {!loading && !error && apps.length === 0 && (
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            No tools tagged yet. Tag apps as "Tools" or "Streaming" in the admin panel to see them here.
          </div>
        </Card>
      )}
      {!loading && !error && apps.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 14,
          }}
        >
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleLaunch(a)}
              disabled={launchingId === a.id}
              className="cc-card"
              style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: 14, textAlign: 'center', cursor: 'pointer' }}
              aria-label={`Launch ${a.name}`}
            >
              {a.logo && (
                <div style={{ width: 48, height: 48, margin: '0 auto 10px', borderRadius: 8, backgroundImage: `url(${a.logo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              )}
              <div style={{ fontWeight: 600, color: '#fff' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{a.category}</div>
            </button>
          ))}
        </div>
      )}
    </PlaceholderPage>
  );
}
