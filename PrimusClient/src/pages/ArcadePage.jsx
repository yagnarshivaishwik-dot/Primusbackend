import { useState } from 'react';
import { Trophy, Users, Clock, Award, ChevronRight, Flame, Target, Zap } from 'lucide-react';

const challenges = [
    {
        id: 1,
        game: 'Valorant',
        title: '10 Headshots Challenge',
        description: 'Get 10 headshots in a single match',
        prize: 2500,
        endDate: 'Jan 15, 2024',
        participants: 156,
        difficulty: 'Medium',
        image: 'https://images.contentstack.io/v3/assets/valorant.jpg'
    },
    {
        id: 2,
        game: 'Fortnite',
        title: 'Victory Royale',
        description: 'Win a solo match',
        prize: 5000,
        endDate: 'Jan 12, 2024',
        participants: 234,
        difficulty: 'Hard',
        image: 'https://cdn2.unrealengine.com/fortnite.jpg'
    },
    {
        id: 3,
        game: 'Counter-Strike 2',
        title: 'Ace Round',
        description: 'Kill all 5 enemies in a single round',
        prize: 10000,
        endDate: 'Jan 20, 2024',
        participants: 89,
        difficulty: 'Expert',
        image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg'
    },
];

const rankings = [
    { rank: 1, name: 'ProGamer123', points: 45000, avatar: 'PG' },
    { rank: 2, name: 'NightOwl', points: 42500, avatar: 'NO' },
    { rank: 3, name: 'ShadowStrike', points: 38900, avatar: 'SS' },
    { rank: 4, name: 'PhantomX', points: 35200, avatar: 'PX' },
    { rank: 5, name: 'CyberNinja', points: 32100, avatar: 'CN' },
];

const ArcadePage = () => {
    const [activeTab, setActiveTab] = useState('challenges');
    const [filterState, setFilterState] = useState('active');

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h1 className="heading-2">
                    <span className="text-gradient">Arcade</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-sm)' }}>
                    Complete challenges, climb rankings, and earn rewards!
                </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' }}>
                {[
                    { id: 'challenges', label: 'Challenges', icon: Target },
                    { id: 'quests', label: 'Quests', icon: Zap },
                    { id: 'rankings', label: 'Rankings', icon: Trophy },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        className={`btn ${activeTab === id ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setActiveTab(id)}
                    >
                        <Icon size={18} />
                        {label}
                    </button>
                ))}
            </div>

            <div className="games-page">
                {/* Sidebar */}
                <aside className="games-sidebar">
                    <div className="filter-section">
                        <h3 className="filter-section__title">State</h3>
                        <div className="tags" style={{ flexDirection: 'column' }}>
                            {['active', 'upcoming', 'past'].map((state) => (
                                <button
                                    key={state}
                                    className={`tag ${filterState === state ? 'active' : ''}`}
                                    onClick={() => setFilterState(state)}
                                    style={{ textTransform: 'capitalize', justifyContent: 'flex-start' }}
                                >
                                    {state}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Your Stats Widget */}
                    <div className="widget" style={{ marginTop: 'var(--spacing-xl)' }}>
                        <div className="widget__header">
                            <Award size={20} style={{ color: 'var(--warning)' }} />
                            <span className="widget__title">Your Stats</span>
                        </div>
                        <div style={{ display: 'grid', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Challenges Won</span>
                                <span style={{ fontWeight: 600 }}>12</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Total Earnings</span>
                                <span style={{ fontWeight: 600, color: 'var(--warning)' }}>24,500</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Current Rank</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>#42</span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="games-main">
                    {activeTab === 'challenges' && (
                        <section className="section">
                            <div className="section__header">
                                <h2 className="section__title">Active Challenges</h2>
                            </div>

                            <div style={{ display: 'grid', gap: 'var(--spacing-lg)' }}>
                                {challenges.map((challenge) => (
                                    <div
                                        key={challenge.id}
                                        className="glass-card"
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '200px 1fr auto',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Game Image */}
                                        <div style={{
                                            background: `linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.3), rgba(var(--accent-secondary-rgb), 0.3))`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: 'var(--spacing-lg)'
                                        }}>
                                            <span style={{ fontSize: '3rem' }}>🎮</span>
                                        </div>

                                        {/* Details */}
                                        <div style={{ padding: 'var(--spacing-lg)' }}>
                                            <div style={{
                                                display: 'inline-flex',
                                                padding: 'var(--spacing-xs) var(--spacing-sm)',
                                                background: 'rgba(var(--accent-primary-rgb), 0.2)',
                                                borderRadius: 'var(--radius-sm)',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                color: 'var(--accent-primary)',
                                                marginBottom: 'var(--spacing-sm)'
                                            }}>
                                                {challenge.game}
                                            </div>
                                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>
                                                {challenge.title}
                                            </h3>
                                            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                                                {challenge.description}
                                            </p>
                                            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', fontSize: '0.875rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', color: 'var(--text-muted)' }}>
                                                    <Users size={16} />
                                                    {challenge.participants} players
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', color: 'var(--text-muted)' }}>
                                                    <Clock size={16} />
                                                    Ends {challenge.endDate}
                                                </span>
                                                <span style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 'var(--spacing-xs)',
                                                    color: challenge.difficulty === 'Expert' ? 'var(--error)' :
                                                        challenge.difficulty === 'Hard' ? 'var(--warning)' : 'var(--success)'
                                                }}>
                                                    <Flame size={16} />
                                                    {challenge.difficulty}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Prize & Action */}
                                        <div style={{
                                            padding: 'var(--spacing-lg)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-end',
                                            justifyContent: 'center',
                                            gap: 'var(--spacing-md)',
                                            borderLeft: '1px solid var(--glass-border)'
                                        }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prize Pool</div>
                                                <div style={{
                                                    fontSize: '1.5rem',
                                                    fontWeight: 700,
                                                    color: 'var(--warning)',
                                                    fontFamily: 'var(--font-display)'
                                                }}>
                                                    {challenge.prize.toLocaleString()} 🪙
                                                </div>
                                            </div>
                                            <button className="btn btn-primary">
                                                Join Challenge
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {activeTab === 'rankings' && (
                        <section className="section">
                            <div className="section__header">
                                <h2 className="section__title">Leaderboard</h2>
                            </div>

                            <div className="glass-card" style={{ overflow: 'hidden' }}>
                                {rankings.map((player, index) => (
                                    <div
                                        key={player.rank}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--spacing-lg)',
                                            padding: 'var(--spacing-lg)',
                                            borderBottom: index < rankings.length - 1 ? '1px solid var(--glass-border)' : 'none',
                                            background: player.rank <= 3 ? `rgba(var(--accent-primary-rgb), ${0.1 - player.rank * 0.02})` : 'transparent'
                                        }}
                                    >
                                        {/* Rank */}
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: 'var(--radius-md)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            fontSize: '1.25rem',
                                            background: player.rank === 1 ? 'linear-gradient(135deg, #ffd700, #ffb700)' :
                                                player.rank === 2 ? 'linear-gradient(135deg, #c0c0c0, #a0a0a0)' :
                                                    player.rank === 3 ? 'linear-gradient(135deg, #cd7f32, #a0522d)' :
                                                        'var(--glass-bg)',
                                            color: player.rank <= 3 ? 'var(--bg-primary)' : 'var(--text-primary)'
                                        }}>
                                            {player.rank}
                                        </div>

                                        {/* Avatar */}
                                        <div style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--accent-gradient)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 600,
                                            color: 'var(--bg-primary)'
                                        }}>
                                            {player.avatar}
                                        </div>

                                        {/* Name */}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>{player.name}</div>
                                        </div>

                                        {/* Points */}
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                fontWeight: 700,
                                                fontSize: '1.25rem',
                                                color: 'var(--warning)',
                                                fontFamily: 'var(--font-display)'
                                            }}>
                                                {player.points.toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>points</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {activeTab === 'quests' && (
                        <section className="section">
                            <div style={{
                                textAlign: 'center',
                                padding: 'var(--spacing-3xl)',
                                color: 'var(--text-muted)'
                            }}>
                                <Zap size={64} style={{ marginBottom: 'var(--spacing-lg)', opacity: 0.3 }} />
                                <h3 style={{ marginBottom: 'var(--spacing-sm)' }}>Coming Soon</h3>
                                <p>Daily and weekly quests are on the way!</p>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
};

export default ArcadePage;
