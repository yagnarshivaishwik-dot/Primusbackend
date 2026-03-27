import { useState, useEffect } from 'react';
import { Search, ShoppingCart, Check } from 'lucide-react';
import { apiService } from '../services/apiClient';
import { showToast } from '../utils/api';

const gamePasses = [
    { id: 1, duration: '15 min', price: 1.50, color: 'pass-card__visual--15min' },
    { id: 2, duration: '30 min', price: 2.50, color: 'pass-card__visual--30min' },
    { id: 3, duration: '1 hour', price: 5.00, color: 'pass-card__visual--1hr' },
    { id: 4, duration: '2 hours', price: 10.00, color: 'pass-card__visual--2hr' },
    { id: 5, duration: '4 hours', price: 15.00, color: 'pass-card__visual--4hr' },
    { id: 6, duration: '10 hours', price: 35.00, color: 'pass-card__visual--10hr' },
    { id: 7, duration: '25 hours', price: 75.00, color: 'pass-card__visual--10hr' },
    { id: 8, duration: '50 hours', price: 125.00, color: 'pass-card__visual--10hr' },
];

const categories = [
    { id: 'passes', label: 'Game Passes', active: true },
    { id: 'pricing', label: 'Standard Pricing', active: false },
    { id: 'offers', label: 'Special Offers', active: false },
];

const ShopPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('passes');
    const [cart, setCart] = useState([]);

    const [balance, setBalance] = useState(0);

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                // Fetch user me to get balance or wallet endpoint
                const res = await apiService.auth.me();
                setBalance(res.data?.wallet_balance || 0);
            } catch (err) {
                console.error("Failed to fetch balance", err);
            }
        };
        fetchBalance();
    }, []);

    const addToCart = (pass) => {
        if (!cart.find(item => item.id === pass.id)) {
            setCart([...cart, pass]);
        }
    };

    const isInCart = (passId) => cart.find(item => item.id === passId);

    const handleCheckout = async () => {
        const total = cart.reduce((sum, item) => sum + item.price, 0);
        if (total > balance) {
            showToast("Insufficient balance!");
            return;
        }

        // Mock checkout since we don't have a direct 'buy_package' endpoint in the list yet
        showToast("Processing purchase...");
        setTimeout(() => {
            showToast("Purchase successful! Time added.");
            setCart([]);
            // Optimistically update balance
            setBalance(prev => Math.max(0, prev - total));
        }, 1500);
    };

    return (
        <div className="page-content">
            {/* Shop Header */}
            <div className="shop-header">
                <div>
                    <h1 className="heading-2">Shop</h1>
                </div>
                <div className="shop-balance">
                    <span className="shop-balance__label">Your Balance</span>
                    <span className="shop-balance__value">${balance.toFixed(2)}</span>
                </div>
            </div>

            <div className="games-page">
                {/* Sidebar */}
                <aside className="games-sidebar">
                    {/* Search */}
                    <div className="search-bar" style={{ marginBottom: 'var(--spacing-xl)', padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                        <Search size={18} className="search-bar__icon" />
                        <input
                            type="text"
                            className="search-bar__input"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ fontSize: '0.9375rem' }}
                        />
                    </div>

                    {/* Categories */}
                    <div className="filter-section">
                        <h3 className="filter-section__title">Browse by Category</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                            {categories.map((cat) => (
                                <button
                                    key={cat.id}
                                    className={`tag ${activeCategory === cat.id ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(cat.id)}
                                    style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Cart Summary */}
                    {cart.length > 0 && (
                        <div className="widget" style={{ marginTop: 'var(--spacing-xl)' }}>
                            <div className="widget__header">
                                <ShoppingCart size={20} style={{ color: 'var(--accent-primary)' }} />
                                <span className="widget__title">Cart ({cart.length})</span>
                            </div>
                            <div style={{ marginTop: 'var(--spacing-md)' }}>
                                {cart.map((item) => (
                                    <div key={item.id} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: 'var(--spacing-sm) 0',
                                        borderBottom: '1px solid var(--glass-border)',
                                        fontSize: '0.9375rem'
                                    }}>
                                        <span>{item.duration}</span>
                                        <span style={{ color: 'var(--success)' }}>${item.price.toFixed(2)}</span>
                                    </div>
                                ))}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    paddingTop: 'var(--spacing-md)',
                                    fontWeight: 600
                                }}>
                                    <span>Total</span>
                                    <span style={{ color: 'var(--success)' }}>
                                        ${cart.reduce((sum, item) => sum + item.price, 0).toFixed(2)}
                                    </span>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
                                    onClick={handleCheckout}
                                >
                                    Checkout
                                </button>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Main Content */}
                <main className="games-main">
                    {/* Section Header */}
                    <section className="section">
                        <div className="section__header">
                            <h2 className="section__title">Game Passes</h2>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-xl)' }}>
                            Purchase gaming time passes. Load them to your account and use whenever you want.
                        </p>

                        {/* Standard Pricing */}
                        <h3 style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            marginBottom: 'var(--spacing-lg)',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            Standard Pricing
                        </h3>

                        <div className="passes-grid">
                            {gamePasses.map((pass) => (
                                <div key={pass.id} className="pass-card">
                                    <div className={`pass-card__visual ${pass.color}`}>
                                        {pass.duration}
                                    </div>
                                    <div className="pass-card__details">
                                        <div className="pass-card__title">{pass.duration}</div>
                                        <div className="pass-card__price">${pass.price.toFixed(2)}</div>
                                        <button
                                            className={`pass-card__btn btn ${isInCart(pass.id) ? 'btn-secondary' : 'btn-primary'}`}
                                            onClick={() => addToCart(pass)}
                                            disabled={isInCart(pass.id)}
                                        >
                                            {isInCart(pass.id) ? (
                                                <>
                                                    <Check size={16} />
                                                    Added
                                                </>
                                            ) : (
                                                'Add to cart'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
};

export default ShopPage;
