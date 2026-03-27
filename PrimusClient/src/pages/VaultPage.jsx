import { useState } from 'react';
import { Gift, Lock, Clock, Coins, ChevronRight } from 'lucide-react';

const prizes = [
    { id: 1, title: '1 Free Hour', cost: 2000, image: '🎮', category: 'Time', unlocked: true },
    { id: 2, title: '2 Free Hours', cost: 3500, image: '🎮', category: 'Time', unlocked: true },
    { id: 3, title: '4 Free Hours', cost: 6000, image: '🎮', category: 'Time', unlocked: true },
    { id: 4, title: '10 Free Hours', cost: 12000, image: '🎮', category: 'Time', unlocked: false },
    { id: 5, title: 'Gaming Mouse', cost: 25000, image: '🖱️', category: 'Gear', unlocked: false },
    { id: 6, title: 'RGB Keyboard', cost: 45000, image: '⌨️', category: 'Gear', unlocked: false },
    { id: 7, title: 'Gaming Headset', cost: 35000, image: '🎧', category: 'Gear', unlocked: false },
    { id: 8, title: '$10 Steam Card', cost: 15000, image: '💳', category: 'Gift Cards', unlocked: true },
];

const categories = ['All', 'Time', 'Gear', 'Gift Cards'];
const states = ['all', 'unlocked', 'locked'];

const VaultPage = () => {
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedState, setSelectedState] = useState('all');
    const userCoins = 12500;

    const filteredPrizes = prizes.filter(prize => {
        const matchesCategory = selectedCategory === 'All' || prize.category === selectedCategory;
        const matchesState = selectedState === 'all' ||
            (selectedState === 'unlocked' && prize.unlocked) ||
            (selectedState === 'locked' && !prize.unlocked);
        return matchesCategory && matchesState;
    });

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                <div>
                    <h1 className="heading-2">
                        <span className="text-gradient">Prize Vault</span>
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--spacing-sm)' }}>
                        Redeem your hard-earned coins for awesome rewards!
                    </p>
                </div>
                <div className="shop-balance">
                    <Coins size={24} style={{ color: 'var(--warning)' }} />
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Your Balance</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning)', fontFamily: 'var(--font-display)' }}>
                            {userCoins.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="games-page">
                {/* Sidebar */}
                <aside className="games-sidebar">
                    <div className="filter-section">
                        <h3 className="filter-section__title">Category</h3>
                        <div className="tags" style={{ flexDirection: 'column' }}>
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    className={`tag ${selectedCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="filter-section">
                        <h3 className="filter-section__title">State</h3>
                        <div className="tags" style={{ flexDirection: 'column' }}>
                            {states.map((state) => (
                                <button
                                    key={state}
                                    className={`tag ${selectedState === state ? 'active' : ''}`}
                                    onClick={() => setSelectedState(state)}
                                    style={{ justifyContent: 'flex-start', textTransform: 'capitalize' }}
                                >
                                    {state}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Main */}
                <main className="games-main">
                    <div className="passes-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                        {filteredPrizes.map((prize) => {
                            const canAfford = userCoins >= prize.cost;
                            const isAvailable = prize.unlocked && canAfford;

                            return (
                                <div
                                    key={prize.id}
                                    className="glass-card"
                                    style={{
                                        overflow: 'hidden',
                                        opacity: !canAfford ? 0.6 : 1,
                                        position: 'relative'
                                    }}
                                >
                                    {/* Locked overlay */}
                                    {!prize.unlocked && (
                                        <div style={{
                                            position: 'absolute',
                                            top: 'var(--spacing-md)',
                                            right: 'var(--spacing-md)',
                                            background: 'rgba(0,0,0,0.8)',
                                            borderRadius: 'var(--radius-full)',
                                            padding: 'var(--spacing-xs) var(--spacing-sm)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--spacing-xs)',
                                            fontSize: '0.75rem',
                                            zIndex: 10
                                        }}>
                                            <Lock size={12} />
                                            Locked
                                        </div>
                                    )}

                                    {/* Visual */}
                                    <div style={{
                                        height: '140px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: prize.category === 'Time'
                                            ? 'linear-gradient(135deg, rgba(var(--accent-primary-rgb), 0.3), rgba(var(--accent-secondary-rgb), 0.3))'
                                            : prize.category === 'Gear'
                                                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(239, 68, 68, 0.3))'
                                                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(59, 130, 246, 0.3))',
                                        fontSize: '4rem'
                                    }}>
                                        {prize.image}
                                    </div>

                                    {/* Details */}
                                    <div style={{ padding: 'var(--spacing-lg)' }}>
                                        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>
                                            {prize.title}
                                        </h3>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--spacing-xs)',
                                            marginBottom: 'var(--spacing-md)',
                                            color: canAfford ? 'var(--warning)' : 'var(--error)'
                                        }}>
                                            <Coins size={18} />
                                            <span style={{ fontWeight: 700, fontSize: '1.25rem', fontFamily: 'var(--font-display)' }}>
                                                {prize.cost.toLocaleString()}
                                            </span>
                                        </div>
                                        <button
                                            className={`btn ${isAvailable ? 'btn-primary' : 'btn-secondary'}`}
                                            style={{ width: '100%' }}
                                            disabled={!isAvailable}
                                        >
                                            {!prize.unlocked ? (
                                                <>
                                                    <Lock size={16} />
                                                    Locked
                                                </>
                                            ) : !canAfford ? (
                                                'Not enough coins'
                                            ) : (
                                                <>
                                                    <Gift size={16} />
                                                    Redeem Now
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default VaultPage;
