import { useEffect, useState } from 'react';
import PlaceholderPage from '@/components/common/PlaceholderPage';
import { Card } from '@/components/common';
import { ROUTES } from '@/app/routes/paths';
import * as lb from '@/features/leaderboard/services/leaderboardService';
import useSessionStore from '@/app/store/useSessionStore';

export default function LeaderboardPage() {
  const currentUser = useSessionStore((s) => s.user);
  const [boards, setBoards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await lb.list();
        if (cancelled) return;
        setBoards(list);
        if (list.length) setActiveId(list[0].id);
        else setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load leaderboards.');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    setLoading(true);
    lb.entries(activeId)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load entries.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const activeBoard = boards.find((b) => b.id === activeId);

  return (
    <PlaceholderPage
      title="Leaderboard"
      subtitle={activeBoard?.name || 'Live rankings'}
      backTo={ROUTES.home}
    >
      {boards.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {boards.map((b) => (
            <button
              type="button"
              key={b.id}
              onClick={() => setActiveId(b.id)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid #3a3d42',
                background: b.id === activeId ? '#E8364F' : 'transparent',
                color: b.id === activeId ? '#fff' : '#E5E7EB',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <Card>
        {loading && <div style={{ color: '#9CA3AF' }}>Loading…</div>}
        {error && !loading && <div style={{ color: '#fca5a5' }}>{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div style={{ color: '#9CA3AF' }}>
            No entries yet — be the first to set a score.
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#E5E7EB' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#9CA3AF', fontSize: 12 }}>
                <th style={{ padding: 10 }}>#</th>
                <th style={{ padding: 10 }}>Player</th>
                <th style={{ padding: 10, textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const you =
                  currentUser &&
                  (String(currentUser.id) === String(r.userId) ||
                    currentUser.email === r.email);
                return (
                  <tr
                    key={`${r.rank}-${r.userId || r.name}`}
                    style={{
                      borderTop: '1px solid #3a3d42',
                      background: you ? 'rgba(232,54,79,0.08)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: 10, fontWeight: 700 }}>{r.rank}</td>
                    <td style={{ padding: 10 }}>
                      {r.name}
                      {you && (
                        <span style={{ color: '#E8364F', fontSize: 11, marginLeft: 6 }}>· you</span>
                      )}
                    </td>
                    <td style={{ padding: 10, textAlign: 'right' }}>
                      {Number(r.score || 0).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </PlaceholderPage>
  );
}
