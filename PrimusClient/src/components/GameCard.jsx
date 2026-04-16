import { Play } from 'lucide-react';

const GameCard = ({ game, ranking, size = 'normal', hideImage = false, onClick }) => {
    const { title, image, genre, badge } = game;

    return (
        <div className={`game-card ${size === 'large' ? 'game-card--large' : ''}`} onClick={onClick}>
            {badge && <span className="game-card__badge">{badge}</span>}
            {ranking && <span className="game-card__badge">Top #{ranking}</span>}

            {(!hideImage) ? (
                <img
                    src={image}
                    alt={title}
                    className="game-card__image"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                    }}
                />
            ) : (
                <div className="game-card__image-placeholder" style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: '3rem',
                    fontWeight: 'bold'
                }}>
                    {title.charAt(0).toUpperCase()}
                </div>
            )}

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
