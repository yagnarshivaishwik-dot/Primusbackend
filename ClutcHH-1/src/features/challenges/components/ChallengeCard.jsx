import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/common';
import { buildPath } from '@/app/routes/paths';

export default function ChallengeCard({ challenge }) {
  return (
    <Link to={buildPath.challenge(challenge.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card>
        <Badge tone={challenge.status === 'claimable' ? 'success' : 'primary'}>
          {challenge.status}
        </Badge>
        <div style={{ fontWeight: 700, color: '#fff', marginTop: 8 }}>{challenge.name}</div>
        <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
          {challenge.game} · {challenge.reward} coins
        </div>
      </Card>
    </Link>
  );
}
