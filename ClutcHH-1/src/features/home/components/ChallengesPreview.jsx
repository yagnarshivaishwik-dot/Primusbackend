import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import ChallengeCard from '@/features/challenges/components/ChallengeCard';

export default function ChallengesPreview({ challenges = [] }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, color: '#fff', margin: 0 }}>Challenges</h2>
        <Link to={ROUTES.challenges} style={{ color: '#E8364F', fontSize: 13, textDecoration: 'none' }}>
          View All →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {challenges.slice(0, 4).map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </div>
    </section>
  );
}
