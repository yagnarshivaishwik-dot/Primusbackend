import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Bell,
  Command,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import useAuthStore from '../../stores/authStore';
import useThemeStore from '../../stores/themeStore';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 100);
      }
      if (e.key === 'Escape') {
        setShowSearch(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const notifications = [
    { id: 1, type: 'warning', title: 'Payment overdue', message: 'Nexus Gaming - 12 days overdue', time: '2h ago' },
    { id: 2, type: 'info', title: 'New café registered', message: 'TechZone Hyderabad joined', time: '4h ago' },
    { id: 3, type: 'success', title: 'Payment received', message: 'GameZone Pro - ₹22,500', time: '1d ago' },
  ];

  return (
    <header className="header">
      {/* Left: Page Context */}
      <div className="header__left">
        <div className="header__breadcrumb">
          <span className="header__breadcrumb-item">Super Admin</span>
        </div>
      </div>

      {/* Center: Global Search */}
      <div className="header__center">
        <button
          className="header__search-trigger"
          onClick={() => setShowSearch(true)}
        >
          <Search size={16} />
          <span>Search cafés, PCs, users...</span>
          <kbd className="header__search-kbd">
            <Command size={12} />
            K
          </kbd>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="header__right">
        {/* Notifications */}
        <div className="header__dropdown-container" ref={notifRef}>
          <button
            className={`header__icon-btn ${showNotifications ? 'header__icon-btn--active' : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={20} />
            <span className="header__badge">3</span>
          </button>

          {showNotifications && (
            <div className="header__dropdown header__dropdown--notifications">
              <div className="header__dropdown-header">
                <h4>Notifications</h4>
                <button className="header__dropdown-action">Mark all read</button>
              </div>
              <div className="header__dropdown-list">
                {notifications.map((notif) => (
                  <div key={notif.id} className={`notification-item notification-item--${notif.type}`}>
                    <div className="notification-item__dot" />
                    <div className="notification-item__content">
                      <span className="notification-item__title">{notif.title}</span>
                      <span className="notification-item__message">{notif.message}</span>
                    </div>
                    <span className="notification-item__time">{notif.time}</span>
                  </div>
                ))}
              </div>
              <div className="header__dropdown-footer">
                <button onClick={() => navigate('/audit-logs')}>View all activity</button>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          className="header__icon-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* User Menu */}
        <div className="header__dropdown-container" ref={userRef}>
          <button
            className={`header__user-trigger ${showUserMenu ? 'header__user-trigger--active' : ''}`}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div className="header__user-avatar">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <ChevronDown size={14} className={`header__chevron ${showUserMenu ? 'header__chevron--open' : ''}`} />
          </button>

          {showUserMenu && (
            <div className="header__dropdown header__dropdown--user">
              <div className="header__dropdown-user-info">
                <span className="header__dropdown-user-name">{user?.username}</span>
                <span className="header__dropdown-user-email">{user?.email}</span>
              </div>
              <div className="header__dropdown-divider" />
              <button className="header__dropdown-item" onClick={() => navigate('/settings')}>
                <User size={16} />
                Profile
              </button>
              <button className="header__dropdown-item" onClick={() => navigate('/settings')}>
                <Settings size={16} />
                Settings
              </button>
              <div className="header__dropdown-divider" />
              <button className="header__dropdown-item header__dropdown-item--danger" onClick={logout}>
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Command Palette Overlay */}
      {showSearch && (
        <div className="command-palette-overlay" onClick={() => setShowSearch(false)}>
          <div className="command-palette" onClick={(e) => e.stopPropagation()}>
            <div className="command-palette__header">
              <Search size={20} className="command-palette__icon" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search cafés, PCs, users, commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="command-palette__input"
              />
              <button
                className="command-palette__close"
                onClick={() => setShowSearch(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="command-palette__body">
              <div className="command-palette__section">
                <span className="command-palette__section-title">Quick Actions</span>
                <button className="command-palette__item">
                  <Search size={16} />
                  <span>Search Cafés</span>
                  <kbd>→</kbd>
                </button>
                <button className="command-palette__item">
                  <Settings size={16} />
                  <span>Open Settings</span>
                  <kbd>S</kbd>
                </button>
              </div>
            </div>
            <div className="command-palette__footer">
              <span><kbd>↑↓</kbd> Navigate</span>
              <span><kbd>↵</kbd> Select</span>
              <span><kbd>Esc</kbd> Close</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .header {
          position: sticky;
          top: 0;
          height: var(--header-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-6);
          background: var(--glass-bg);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid var(--glass-border);
          z-index: 50;
        }

        .header__left,
        .header__right {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .header__center {
          flex: 1;
          display: flex;
          justify-content: center;
          max-width: 480px;
          margin: 0 var(--space-8);
        }

        .header__breadcrumb-item {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-secondary);
        }

        /* Search Trigger */
        .header__search-trigger {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: var(--space-2) var(--space-4);
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-tertiary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .header__search-trigger:hover {
          border-color: var(--border-hover);
          background: var(--bg-subtle);
        }

        .header__search-trigger span {
          flex: 1;
          text-align: left;
        }

        .header__search-kbd {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-default);
          border-radius: 4px;
          font-size: 11px;
          font-family: var(--font-sans);
          color: var(--text-quaternary);
        }

        /* Icon Button */
        .header__icon-btn {
          position: relative;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .header__icon-btn:hover,
        .header__icon-btn--active {
          background: var(--glass-bg);
          border-color: var(--border-default);
          color: var(--text-primary);
        }

        .header__badge {
          position: absolute;
          top: 6px;
          right: 6px;
          min-width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--status-danger);
          border-radius: 8px;
          font-size: 10px;
          font-weight: 600;
          color: white;
          padding: 0 4px;
        }

        /* User Trigger */
        .header__user-trigger {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .header__user-trigger:hover,
        .header__user-trigger--active {
          background: var(--glass-bg);
          border-color: var(--border-default);
        }

        .header__user-avatar {
          width: 32px;
          height: 32px;
          background: var(--accent-gradient);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: var(--text-sm);
          color: white;
        }

        .header__chevron {
          color: var(--text-tertiary);
          transition: transform var(--duration-fast) var(--ease-out);
        }

        .header__chevron--open {
          transform: rotate(180deg);
        }

        /* Dropdowns */
        .header__dropdown-container {
          position: relative;
        }

        .header__dropdown {
          position: absolute;
          top: calc(100% + var(--space-2));
          right: 0;
          min-width: 280px;
          background: var(--glass-bg-elevated);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-xl);
          overflow: hidden;
          animation: slideUp var(--duration-fast) var(--ease-out);
        }

        .header__dropdown--notifications {
          width: 360px;
        }

        .header__dropdown-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4);
          border-bottom: 1px solid var(--divider);
        }

        .header__dropdown-header h4 {
          font-size: var(--text-sm);
          font-weight: 600;
        }

        .header__dropdown-action {
          background: none;
          border: none;
          font-size: var(--text-xs);
          color: var(--accent-primary);
          cursor: pointer;
        }

        .header__dropdown-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .notification-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-4);
          cursor: pointer;
          transition: background var(--duration-fast) var(--ease-out);
        }

        .notification-item:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .notification-item__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-top: 4px;
          flex-shrink: 0;
        }

        .notification-item--warning .notification-item__dot {
          background: var(--status-warning);
        }

        .notification-item--info .notification-item__dot {
          background: var(--status-info);
        }

        .notification-item--success .notification-item__dot {
          background: var(--status-success);
        }

        .notification-item__content {
          flex: 1;
          min-width: 0;
        }

        .notification-item__title {
          display: block;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
        }

        .notification-item__message {
          display: block;
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .notification-item__time {
          font-size: var(--text-xs);
          color: var(--text-quaternary);
          flex-shrink: 0;
        }

        .header__dropdown-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--divider);
          text-align: center;
        }

        .header__dropdown-footer button {
          background: none;
          border: none;
          font-size: var(--text-sm);
          color: var(--accent-primary);
          cursor: pointer;
        }

        /* User Dropdown */
        .header__dropdown--user {
          min-width: 200px;
          padding: var(--space-2);
        }

        .header__dropdown-user-info {
          padding: var(--space-3);
        }

        .header__dropdown-user-name {
          display: block;
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
        }

        .header__dropdown-user-email {
          display: block;
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .header__dropdown-divider {
          height: 1px;
          background: var(--divider);
          margin: var(--space-2) 0;
        }

        .header__dropdown-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: var(--space-3);
          background: none;
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .header__dropdown-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
        }

        .header__dropdown-item--danger:hover {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        /* Command Palette */
        .command-palette-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 15vh;
          z-index: 1000;
          animation: fadeIn var(--duration-fast) var(--ease-out);
        }

        .command-palette {
          width: 100%;
          max-width: 600px;
          background: var(--glass-bg-elevated);
          backdrop-filter: blur(32px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          overflow: hidden;
          animation: slideUp var(--duration-base) var(--ease-out);
        }

        .command-palette__header {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-4) var(--space-5);
          border-bottom: 1px solid var(--divider);
        }

        .command-palette__icon {
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .command-palette__input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-size: var(--text-lg);
          color: var(--text-primary);
        }

        .command-palette__input::placeholder {
          color: var(--text-quaternary);
        }

        .command-palette__close {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          cursor: pointer;
        }

        .command-palette__body {
          padding: var(--space-3);
          max-height: 400px;
          overflow-y: auto;
        }

        .command-palette__section-title {
          display: block;
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-quaternary);
          padding: var(--space-2) var(--space-3);
        }

        .command-palette__item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: var(--space-3);
          background: none;
          border: none;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .command-palette__item:hover {
          background: var(--accent-primary-subtle);
          color: var(--text-primary);
        }

        .command-palette__item kbd {
          margin-left: auto;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-default);
          border-radius: 4px;
          font-size: 10px;
          color: var(--text-quaternary);
        }

        .command-palette__footer {
          display: flex;
          gap: var(--space-6);
          padding: var(--space-3) var(--space-5);
          border-top: 1px solid var(--divider);
          font-size: var(--text-xs);
          color: var(--text-quaternary);
        }

        .command-palette__footer kbd {
          padding: 2px 4px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-default);
          border-radius: 3px;
          margin-right: 4px;
        }
      `}</style>
    </header>
  );
}
