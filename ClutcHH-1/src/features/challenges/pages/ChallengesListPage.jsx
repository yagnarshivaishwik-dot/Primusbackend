import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import { listEvents } from '@/features/quests/services/eventsService';

/**
 * Challenges list — backed by /api/v1/event/ (the backend models active
 * challenges as events). Each row links to the detail route by id.
 */
export default function ChallengesListPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listEvents()
      .then((rows) => { if (!cancelled) setEvents(rows); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load challenges.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <PlaceholderPage title="Challenges" subtitle="Active challenges" backTo={ROUTES.home}>
      {loading && <Card><div style={{ color: '#9CA3AF' }}>Loading…</div></Card>}
      {error && !loading && <Card><div style={{ color: '#fca5a5' }}>{error}</div></Card>}
      {!loading && !error && events.length === 0 && (
        <Card>
          <div style={{ color: '#9CA3AF' }}>
            No active challenges right now. Check back once the admin publishes new events.
          </div>
        </Card>
      )}
      {!loading && !error && events.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {events.map((e) => (
            <Link
              key={e.id}
              to={ROUTES.challengeDetail.replace(':id', e.id)}
              style={{ textDecoration: 'none' }}
            >
              <Card>
                <div style={{ fontWeight: 700, color: '#fff' }}>{e.name}</div>
                {e.description && (
                  <div style={{ color: '#9CA3AF', fontSize: 13, margin: '6px 0' }}>
                    {e.description}
                  </div>
                )}
                <div style={{ color: '#6B7280', fontSize: 11 }}>
                  {e.endTime ? `Ends ${new Date(e.endTime).toLocaleDateString()}` : 'Ongoing'}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PlaceholderPage>
  );
}
