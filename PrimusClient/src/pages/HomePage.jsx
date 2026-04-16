import { useState, useEffect } from 'react';
import { ArrowRight, Gift, Users, Sparkles, ChevronRight } from 'lucide-react';
import GameCard from '../components/GameCard';
import Widget, { ProgressWidget, SocialWidget } from '../components/Widget';
import { apiService } from '../services/apiClient';

const socialFeedItems = [
    { initials: 'JD', name: 'John', action: 'just started playing CS2', time: '2 min ago' },
    { initials: 'SK', name: 'Sarah', action: 'earned 500 ggCoins', time: '5 min ago' },
    { initials: 'MK', name: 'Mike', action: 'gave a high five', time: '12 min ago' },
    { initials: 'AL', name: 'Alex', action: 'unlocked an achievement', time: '18 min ago' },
    { initials: 'EM', name: 'Emma', action: 'just logged in', time: '25 min ago' },
];

const HomePage = () => {
    const [popularGames, setPopularGames] = useState([]);
    const [recentGames, setRecentGames] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Fetch popular games
                const res = await apiService.games.popular();
                // Ensure we have an array
                const games = Array.isArray(res.data) ? res.data : (res.data?.games || []);

                setPopularGames(games);
                // For "Continue Playing", we might need a specific endpoint or just reuse some games for now
                setRecentGames(games.slice(0, 4));
            } catch (error) {
                console.error("Failed to fetch games:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Helper to map backend game object to UI format if needed
    // Assuming backend returns standard format, but adding fallback just in case
    const mapGame = (g) => ({
        id: g.id,
        title: g.title || g.name,
        image: g.image || g.cover_url || g.icon_url || 'https://picsum.photos/400/600',
        genre: g.genre || 'Game',
        badge: g.is_popular ? 'Popular' : undefined
    });

    if (loading) {
        return (
            <div className="page-content center-content">
                <div className="loading-spinner" />
            </div>
        );
    }

    return (
        <div className="page-content">
            <div className="home-layout">
                {/* Main Content */}
                <div className="home-main">
                    {/* Hero Section */}
                    <div className="hero">
                        <div className="hero__background">
                            <img
                                src={popularGames[0]?.image || popularGames[0]?.cover_url || "https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg"}
                                alt="Featured Game"
                            />
                        </div>
                        <div className="hero__overlay" />
                        <div className="hero__content">
                            <span className="hero__badge">
                                <Sparkles size={14} />
                                Featured Game
                            </span>
                            <h1 className="hero__title">
                                <span className="text-gradient">{popularGames[0]?.title || popularGames[0]?.name || "Welcome to Primus"}</span>
                            </h1>
                            <p className="hero__description">
                                {popularGames[0]?.description || "Experience the next generation of gaming at Primus. High performance, low latency, and premium experience."}
                            </p>
                            <div className="hero__actions">
                                <button className="btn btn-primary btn-lg">
                                    Play Now
                                    <ArrowRight size={18} />
                                </button>
                                <button className="btn btn-secondary btn-lg">
                                    Learn More
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Popular Games */}
                    <section className="section">
                        <div className="section__header">
                            <h2 className="section__title">Most Played Games</h2>
                            <a href="/games" className="section__link">
                                View all games
                                <ChevronRight size={18} />
                            </a>
                        </div>
                        <div className="games-row">
                            {popularGames.length > 0 ? (
                                popularGames.slice(0, 5).map((game, index) => (
                                    <GameCard
                                        key={game.id}
                                        game={mapGame(game)}
                                        ranking={index + 1}
                                    />
                                ))
                            ) : (
                                <p className="text-muted">No games available at the moment.</p>
                            )}
                        </div>
                    </section>

                    {/* Recently Played */}
                    {recentGames.length > 0 && (
                        <section className="section">
                            <div className="section__header">
                                <h2 className="section__title">Continue Playing</h2>
                                <a href="/games" className="section__link">
                                    View history
                                    <ChevronRight size={18} />
                                </a>
                            </div>
                            <div className="games-row">
                                {recentGames.map((game) => (
                                    <GameCard key={game.id} game={mapGame(game)} />
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Widgets Sidebar */}
                <div className="widgets">
                    {/* Discord Widget */}
                    <Widget
                        icon={<Users size={20} color="white" />}
                        iconBg="#5865f2"
                        title="Join Our Community"
                    >
                        <p style={{ marginBottom: 'var(--spacing-md)' }}>
                            Connect with other players and get exclusive updates!
                        </p>
                        <button className="btn btn-secondary" style={{ width: '100%' }}>
                            Join Discord
                        </button>
                    </Widget>

                    {/* Rewards Progress */}
                    <ProgressWidget
                        icon={<Gift size={20} color="white" />}
                        iconBg="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"
                        title="4 Free Hours"
                        current={7500}
                        total={11000}
                        label="Play more to earn free gaming time!"
                        actionLabel="Redeem Now"
                    />

                    {/* Social Feed */}
                    <SocialWidget
                        title="Activity Feed"
                        items={socialFeedItems}
                    />
                </div>
            </div>
        </div>
    );
};

export default HomePage;
