import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Home, Gamepad2, Grid3X3, AppWindow, ShoppingCart, Trophy,
    Bell, Volume2, HelpCircle, User, Settings, Lock, LogOut,
    Clock, Wallet, Coins, ChevronDown, Menu, X
} from 'lucide-react';

const navLinks = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/games', label: 'Games', icon: Gamepad2 },
    { path: '/arcade', label: 'Arcade', icon: Grid3X3 },
    { path: '/apps', label: 'Apps', icon: AppWindow },
    { path: '/shop', label: 'Shop', icon: ShoppingCart },
    { path: '/vault', label: 'Prize Vault', icon: Trophy },
];

// Props: user (object with name, initials), minutesLeft (number), cashBalance, ggCoins, onLogout
const Header = ({ user, minutesLeft = 0, cashBalance = 0, ggCoins = 0, onLogout }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Format minutes into hours/minutes display
    const formatTime = (mins) => {
        if (!mins || mins <= 0) return '0m';
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    // Default user if not provided
    const displayUser = user || {
        name: 'Guest',
        initials: 'G',
    };

    const timeRemaining = formatTime(minutesLeft);
    const displayCash = typeof cashBalance === 'number' ? `$${cashBalance.toFixed(2)}` : cashBalance;
    const displayCoins = typeof ggCoins === 'number' ? ggCoins.toLocaleString() : ggCoins;

    const handleLogout = () => {
        setDropdownOpen(false);
        if (onLogout) onLogout();
    };

    return (
        <header className="header">
            {/* Logo */}
            <div className="header__logo">
                <div className="header__logo-icon">P</div>
                <span className="header__logo-text">PRIMUS</span>
            </div>

            {/* Navigation */}
            <nav className="header__nav">
                {navLinks.map((link) => (
                    <NavLink
                        key={link.path}
                        to={link.path}
                        className={({ isActive }) =>
                            `header__nav-link ${isActive ? 'active' : ''}`
                        }
                    >
                        {link.label}
                    </NavLink>
                ))}
            </nav>

            {/* Mobile Menu Toggle */}
            <button
                className="mobile-nav-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
            >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Mobile Navigation Drawer */}
            {mobileMenuOpen && (
                <div className="mobile-nav-drawer" style={{
                    position: 'fixed',
                    top: 'var(--header-height)',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'var(--bg-primary)',
                    zIndex: 150,
                    padding: 'var(--spacing-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-sm)',
                    animation: 'fadeIn 0.2s ease'
                }}>
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                onClick={() => setMobileMenuOpen(false)}
                                className={({ isActive }) =>
                                    `header__nav-link ${isActive ? 'active' : ''}`
                                }
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--spacing-md)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-md)'
                                }}
                            >
                                <Icon size={20} />
                                {link.label}
                            </NavLink>
                        );
                    })}
                </div>
            )}

            {/* Actions */}
            <div className="header__actions">
                {/* Help */}
                <button className="header__icon-btn" title="Help">
                    <HelpCircle size={20} />
                </button>

                {/* Volume */}
                <button className="header__icon-btn" title="Volume">
                    <Volume2 size={20} />
                </button>

                {/* Notifications */}
                <div className={`dropdown ${notificationsOpen ? 'open' : ''}`}>
                    <button
                        className="header__icon-btn"
                        onClick={() => {
                            setNotificationsOpen(!notificationsOpen);
                            setDropdownOpen(false);
                        }}
                    >
                        <Bell size={20} />
                        <span className="badge">3</span>
                    </button>

                    <div className="dropdown__menu" style={{ minWidth: '340px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Notifications</h3>
                            <button className="btn btn-ghost btn-sm">Mark all read</button>
                        </div>

                        {[
                            { title: 'Welcome bonus!', desc: 'You received 500 ggCoins', time: '2 min ago', unread: true },
                            { title: 'New game available', desc: 'Counter-Strike 2 has been added', time: '1 hour ago', unread: true },
                            { title: 'Achievement unlocked', desc: "You earned 'First Timer'", time: '3 hours ago', unread: false },
                        ].map((notif, i) => (
                            <div
                                key={i}
                                className="dropdown__item"
                                style={{
                                    opacity: notif.unread ? 1 : 0.6,
                                    borderLeft: notif.unread ? '3px solid var(--accent-primary)' : 'none',
                                    paddingLeft: notif.unread ? 'calc(var(--spacing-md) - 3px)' : 'var(--spacing-md)'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500, marginBottom: '2px' }}>{notif.title}</div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{notif.desc}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{notif.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* User Profile */}
                <div className={`dropdown ${dropdownOpen ? 'open' : ''}`}>
                    <button
                        className="header__user"
                        onClick={() => {
                            setDropdownOpen(!dropdownOpen);
                            setNotificationsOpen(false);
                        }}
                    >
                        <div className="header__user-info">
                            <div className="header__user-name">{displayUser.name}</div>
                            <div className="header__user-time">
                                <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                {timeRemaining}
                            </div>
                        </div>
                        <div className="header__user-avatar">{displayUser.initials}</div>
                        <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                    </button>

                    <div className="dropdown__menu">
                        {/* Balances */}
                        <div className="dropdown__section">
                            <div className="balance-cards" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                <div className="balance-card">
                                    <Wallet size={18} style={{ color: 'var(--success)', marginBottom: '4px' }} />
                                    <div className="balance-card__value" style={{ fontSize: '0.9375rem' }}>{displayCash}</div>
                                    <div className="balance-card__label">Cash</div>
                                </div>
                                <div className="balance-card">
                                    <Clock size={18} style={{ color: 'var(--accent-primary)', marginBottom: '4px' }} />
                                    <div className="balance-card__value" style={{ fontSize: '0.9375rem', color: 'var(--accent-primary)' }}>{timeRemaining}</div>
                                    <div className="balance-card__label">Time</div>
                                </div>
                                <div className="balance-card">
                                    <Coins size={18} style={{ color: 'var(--warning)', marginBottom: '4px' }} />
                                    <div className="balance-card__value" style={{ fontSize: '0.9375rem', color: 'var(--warning)' }}>{displayCoins}</div>
                                    <div className="balance-card__label">Coins</div>
                                </div>
                            </div>
                        </div>

                        {/* Menu Items */}
                        <div className="dropdown__section">
                            <div className="dropdown__item" onClick={() => { navigate('/account'); setDropdownOpen(false); }}>
                                <User size={18} />
                                <span>Account</span>
                            </div>
                            <div className="dropdown__item" onClick={() => { navigate('/settings'); setDropdownOpen(false); }}>
                                <Settings size={18} />
                                <span>PC Settings</span>
                            </div>
                            <div className="dropdown__item">
                                <Lock size={18} />
                                <span>Lock PC</span>
                            </div>
                        </div>

                        {/* Logout */}
                        <div className="dropdown__section">
                            <div className="dropdown__item dropdown__item--danger" onClick={handleLogout}>
                                <LogOut size={18} />
                                <span>Sign Out</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
