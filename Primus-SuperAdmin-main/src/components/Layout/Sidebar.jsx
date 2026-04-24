import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  BarChart3,
  Users,
  FileText,
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';
import useAuthStore, { PERMISSIONS } from '../../stores/authStore';

const navItems = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    path: '/dashboard',
    description: 'Executive dashboard'
  },
  {
    label: 'Cafés',
    icon: Building2,
    path: '/cafes',
    permission: PERMISSIONS.VIEW_CAFE_REGISTRY,
    description: 'Manage registered cafés'
  },
  {
    label: 'Subscriptions',
    icon: CreditCard,
    path: '/subscriptions',
    permission: PERMISSIONS.VIEW_SUBSCRIPTIONS,
    description: 'Billing & revenue'
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    path: '/analytics',
    permission: PERMISSIONS.VIEW_FINANCIAL_ANALYTICS,
    description: 'Business intelligence'
  },
  {
    label: 'System Health',
    icon: Activity,
    path: '/system-health',
    permission: PERMISSIONS.VIEW_PC_HEALTH,
    description: 'Infrastructure status'
  },
];

const adminItems = [
  {
    label: 'Users & Roles',
    icon: Users,
    path: '/users',
    permission: PERMISSIONS.MANAGE_USERS,
    description: 'Access control'
  },
  {
    label: 'Audit Logs',
    icon: FileText,
    path: '/audit-logs',
    permission: PERMISSIONS.VIEW_AUDIT_LOGS,
    description: 'Activity history'
  },
  {
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    description: 'System configuration'
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, hasPermission, logout, isSuperAdmin } = useAuthStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  const renderNavItem = (item) => {
    if (item.permission && !hasPermission(item.permission) && !isSuperAdmin()) {
      return null;
    }

    const Icon = item.icon;
    const isActive = location.pathname === item.path ||
      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));

    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''}`}
        title={isCollapsed ? item.label : undefined}
      >
        <div className="sidebar__nav-icon">
          <Icon size={20} />
        </div>
        {!isCollapsed && (
          <div className="sidebar__nav-content">
            <span className="sidebar__nav-label">{item.label}</span>
            <span className="sidebar__nav-desc">{item.description}</span>
          </div>
        )}
        {isActive && <div className="sidebar__nav-indicator" />}
      </NavLink>
    );
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar__header">
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                fill="url(#logoGrad)"
              />
              <path
                d="M2 17L12 22L22 17"
                stroke="url(#logoGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12L12 17L22 12"
                stroke="url(#logoGrad)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="logoGrad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          {!isCollapsed && (
            <div className="sidebar__logo-text">
              <span className="sidebar__logo-title">Primus</span>
              <span className="sidebar__logo-subtitle">Control Plane</span>
            </div>
          )}
        </div>
        <button
          className="sidebar__collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="sidebar__nav">
        <div className="sidebar__nav-section">
          {!isCollapsed && <span className="sidebar__nav-title">Main</span>}
          <div className="sidebar__nav-list">
            {navItems.map(renderNavItem)}
          </div>
        </div>

        <div className="sidebar__nav-section">
          {!isCollapsed && <span className="sidebar__nav-title">Administration</span>}
          <div className="sidebar__nav-list">
            {adminItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="sidebar__footer">
        {/* Theme Toggle */}
        <button
          className="sidebar__theme-toggle"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          {!isCollapsed && <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {/* User Section */}
        <div className="sidebar__user">
          <div className="sidebar__user-avatar">
            {user?.username?.charAt(0).toUpperCase() || 'A'}
          </div>
          {!isCollapsed && (
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{user?.username || 'Admin'}</span>
              <span className="sidebar__user-role">
                {user?.role === 'superadmin' ? 'Super Admin' : user?.role}
              </span>
            </div>
          )}
          <button
            className="sidebar__logout-btn"
            onClick={logout}
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: var(--sidebar-width);
          background: var(--glass-bg);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border-right: 1px solid var(--glass-border);
          display: flex;
          flex-direction: column;
          z-index: 100;
          transition: width var(--duration-base) var(--ease-out);
        }

        .sidebar::before {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--glass-noise);
          opacity: 0.008;
          pointer-events: none;
        }

        .sidebar--collapsed {
          width: var(--sidebar-collapsed);
        }

        /* Header */
        .sidebar__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-5);
          border-bottom: 1px solid var(--divider);
        }

        .sidebar__logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .sidebar__logo-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sidebar__logo-icon svg {
          width: 28px;
          height: 28px;
        }

        .sidebar__logo-text {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .sidebar__logo-title {
          font-size: var(--text-lg);
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .sidebar__logo-subtitle {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .sidebar__collapse-btn {
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
          transition: all var(--duration-fast) var(--ease-out);
        }

        .sidebar__collapse-btn:hover {
          background: var(--glass-bg-hover);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .sidebar--collapsed .sidebar__collapse-btn {
          display: none;
        }

        /* Navigation */
        .sidebar__nav {
          flex: 1;
          padding: var(--space-4);
          overflow-y: auto;
          overflow-x: hidden;
        }

        .sidebar__nav-section {
          margin-bottom: var(--space-6);
        }

        .sidebar__nav-section:last-child {
          margin-bottom: 0;
        }

        .sidebar__nav-title {
          display: block;
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-quaternary);
          padding: var(--space-2) var(--space-3);
          margin-bottom: var(--space-2);
        }

        .sidebar__nav-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .sidebar__nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          transition: all var(--duration-fast) var(--ease-out);
          overflow: hidden;
        }

        .sidebar__nav-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
        }

        .sidebar__nav-item--active {
          background: var(--accent-primary-subtle);
          color: var(--accent-primary);
        }

        .sidebar__nav-item--active:hover {
          background: var(--accent-primary-subtle);
        }

        .sidebar__nav-icon {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sidebar__nav-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .sidebar__nav-label {
          font-size: var(--text-sm);
          font-weight: 500;
        }

        .sidebar__nav-desc {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          opacity: 0;
          transition: opacity var(--duration-fast) var(--ease-out);
        }

        .sidebar__nav-item:hover .sidebar__nav-desc {
          opacity: 1;
        }

        .sidebar__nav-item--active .sidebar__nav-desc {
          color: var(--accent-primary);
          opacity: 0.7;
        }

        .sidebar__nav-indicator {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 20px;
          background: var(--accent-primary);
          border-radius: 0 2px 2px 0;
        }

        /* Footer */
        .sidebar__footer {
          padding: var(--space-4);
          border-top: 1px solid var(--divider);
        }

        .sidebar__theme-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: var(--space-3);
          margin-bottom: var(--space-3);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }

        .sidebar__theme-toggle:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--border-hover);
          color: var(--text-primary);
        }

        .sidebar--collapsed .sidebar__theme-toggle span {
          display: none;
        }

        .sidebar__user {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-md);
        }

        .sidebar__user-avatar {
          width: 36px;
          height: 36px;
          background: var(--accent-gradient);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: var(--text-sm);
          color: white;
          flex-shrink: 0;
        }

        .sidebar__user-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .sidebar__user-name {
          font-size: var(--text-sm);
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar__user-role {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
        }

        .sidebar__logout-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: all var(--duration-fast) var(--ease-out);
        }

        .sidebar__logout-btn:hover {
          background: var(--status-danger-subtle);
          color: var(--status-danger);
        }

        .sidebar--collapsed .sidebar__user-info {
          display: none;
        }

        .sidebar--collapsed .sidebar__user {
          padding: var(--space-2);
          justify-content: center;
        }

        .sidebar--collapsed .sidebar__logout-btn {
          display: none;
        }
      `}</style>
    </aside>
  );
}
