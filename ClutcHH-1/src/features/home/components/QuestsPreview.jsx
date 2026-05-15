import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/common';
import { ROUTES, buildPath } from '@/app/routes/paths';

export default function QuestsPreview({ quests = [] }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, color: '#fff', margin: 0 }}>Quests</h2>
        <Link to={ROUTES.quests} style={{ color: '#E8364F', fontSize: 13, textDecoration: 'none' }}>
          View All →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {quests.slice(0, 3).map((q) => (
          <Link key={q.id} to={buildPath.quest(q.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card>
              <div style={{ fontSize: 28 }}>{q.icon}</div>
              <div style={{ fontWeight: 700, color: '#fff', marginTop: 6 }}>{q.name}</div>
              <div style={{ marginTop: 6 }}>
                {q.claimable ? <Badge tone="success">Claim!</Badge> : <Badge tone="muted">{q.progress}%</Badge>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
