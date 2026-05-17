import { Link } from 'react-router-dom';
import { buildPath } from '@/app/routes/paths';

export default function ArcadeTile({ game }) {
  return (
    <Link to={buildPath.arcade(game.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="cc-card" style={{ minHeight: 140 }}>
        <div style={{ fontWeight: 700, color: '#fff' }}>{game.name}</div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{game.plays} plays today</div>
      </div>
    </Link>
  );
}
