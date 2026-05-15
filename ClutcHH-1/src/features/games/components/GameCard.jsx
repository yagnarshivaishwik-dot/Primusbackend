import { Link } from 'react-router-dom';
import { buildPath } from '@/app/routes/paths';

export default function GameCard({ game }) {
  return (
    <Link to={buildPath.game(game.id)} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="game-card">
        <div className="game-card__image-wrapper">
          <div className={`game-cover ${game.colorClass || ''}`}>
            <span className="game-cover__title">{game.name}</span>
          </div>
          {game.badge && <span className="game-card__badge">Top {game.badge}</span>}
        </div>
        <span className="game-card__name">{game.name}</span>
      </div>
    </Link>
  );
}
