import { Play } from 'lucide-react';

const GameCard = ({ game, ranking, size = 'normal' }) => {
    const { title, image, genre, badge } = game;

    return (
        <div className={`game-card ${size === 'large' ? 'game-card--large' : ''}`}>
            {badge && <span className="game-card__badge">{badge}</span>}
            {ranking && <span className="game-card__badge">Top #{ranking}</span>}

            <img
                src={image}
                alt={title}
                className="game-card__image"
                onError={(e) => {
                    e.target.src = `https://picsum.photos/seed/${title}/400/600`;
                }}
            />

            <div className="game-card__play-btn">
                <Play size={24} fill="var(--bg-primary)" color="var(--bg-primary)" />
            </div>

            <div className="game-card__content">
                <div className="game-card__title">{title}</div>
                {genre && <div className="game-card__meta">{genre}</div>}
            </div>
        </div>
    );
};

export default GameCard;
