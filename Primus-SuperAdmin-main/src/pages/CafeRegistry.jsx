import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2,
    Search,
    Plus,
    ChevronRight,
    Filter,
    MapPin,
    Monitor,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';
import api from '../api/client';

const STATUS_CONFIG = {
    active: { label: 'Active', color: 'success' },
    trial: { label: 'Trial', color: 'info' },
    expiring: { label: 'Expiring', color: 'warning' },
    expired: { label: 'Expired', color: 'danger' },
    none: { label: 'No License', color: 'neutral' },
    suspended: { label: 'Suspended', color: 'danger' },
};

export default function CafeRegistry() {
    const navigate = useNavigate();
    const { hasPermission, isSuperAdmin } = useAuthStore();

    const [cafes, setCafes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const canEdit = hasPermission(PERMISSIONS.EDIT_CAFE_DETAILS) || isSuperAdmin();

    // Fetch cafés from API
    const fetchCafes = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get('/internal/cafes');
            setCafes(response.data || []);
        } catch (err) {
            console.error('Failed to fetch cafés:', err);
            setError(err.response?.data?.detail || 'Failed to load cafés');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchCafes();
    }, []);

    const filteredCafes = useMemo(() => {
        let result = [...cafes];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.name?.toLowerCase().includes(q) ||
                c.owner_name?.toLowerCase().includes(q) ||
                c.owner_email?.toLowerCase().includes(q)
            );
        }
        if (statusFilter !== 'all') {
            result = result.filter(c => c.license_status === statusFilter);
        }
        return result;
    }, [cafes, searchQuery, statusFilter]);

    const stats = useMemo(() => ({
        total: cafes.length,
        active: cafes.filter(c => c.license_status === 'active').length,
        trial: cafes.filter(c => c.license_status === 'none').length,
        atRisk: cafes.filter(c => c.license_status === 'expiring' || c.license_status === 'expired').length,
    }), [cafes]);

    const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

    return (
        <div className="cafe-registry">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Cafés</h1>
                    <p className="page-subtitle">{stats.total} registered • {stats.active} active • {stats.trial} trials</p>
                </div>
                {canEdit && (
                    <button className="btn btn--primary">
                        <Plus size={16} />
                        Add Café
                    </button>
                )}
            </div>

            {/* Quick Stats */}
            <div className="quick-stats">
                <button className={`quick-stat ${statusFilter === 'all' ? 'quick-stat--active' : ''}`} onClick={() => setStatusFilter('all')}>
                    <span className="quick-stat__value">{stats.total}</span>
                    <span className="quick-stat__label">All</span>
                </button>
                <button className={`quick-stat ${statusFilter === 'subscribed_active' ? 'quick-stat--active' : ''}`} onClick={() => setStatusFilter('subscribed_active')}>
                    <span className="quick-stat__value">{stats.active}</span>
                    <span className="quick-stat__label">Active</span>
                </button>
                <button className={`quick-stat ${statusFilter === 'trial_active' ? 'quick-stat--active' : ''}`} onClick={() => setStatusFilter('trial_active')}>
                    <span className="quick-stat__value">{stats.trial}</span>
                    <span className="quick-stat__label">Trial</span>
                </button>
                <button className={`quick-stat ${statusFilter === 'subscribed_payment_due' || statusFilter === 'suspended' ? 'quick-stat--active' : ''}`} onClick={() => setStatusFilter('subscribed_payment_due')}>
                    <span className="quick-stat__value">{stats.atRisk}</span>
                    <span className="quick-stat__label">At Risk</span>
                </button>
            </div>

            {/* Search */}
            <div className="search-bar">
                <Search size={16} className="search-bar__icon" />
                <input
                    type="text"
                    placeholder="Search cafés by name, owner, or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-bar__input"
                />
            </div>

            {/* Table */}
            <div className="card table-card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Café</th>
                            <th>Owner</th>
                            <th>Location</th>
                            <th>PCs</th>
                            <th>Status</th>
                            <th>MRR</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="empty-state">
                                        <Loader2 size={32} className="spin" />
                                        <p>Loading cafés...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="empty-state empty-state--error">
                                        <p>{error}</p>
                                        <button className="btn btn--secondary btn--sm" onClick={fetchCafes}>
                                            <RefreshCw size={14} /> Retry
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredCafes.length === 0 ? (
                            <tr>
                                <td colSpan={7}>
                                    <div className="empty-state">
                                        <Building2 size={48} />
                                        <p>No cafés found</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredCafes.map((cafe) => {
                                const status = STATUS_CONFIG[cafe.license_status] || STATUS_CONFIG.none;
                                return (
                                    <tr key={cafe.id} className="clickable" onClick={() => navigate(`/cafes/${cafe.id}`)}>
                                        <td>
                                            <div className="cafe-cell">
                                                <div className="cafe-cell__avatar">
                                                    <Building2 size={16} />
                                                </div>
                                                <span className="cafe-cell__name">{cafe.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-secondary">{cafe.owner_name || cafe.owner_email || '—'}</td>
                                        <td>
                                            <div className="location-cell">
                                                <Monitor size={14} />
                                                {cafe.online_pc_count}/{cafe.pc_count} online
                                            </div>
                                        </td>
                                        <td>
                                            <div className="pcs-cell">
                                                <Monitor size={14} />
                                                {cafe.pc_count || 0}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge badge--${status?.color}`}>{status?.label}</span>
                                        </td>
                                        <td className="font-mono text-tertiary">
                                            {cafe.subscription_end ? new Date(cafe.subscription_end).toLocaleDateString() : '—'}
                                        </td>
                                        <td><ChevronRight size={16} className="text-tertiary" /></td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <style>{`
        .cafe-registry { max-width: 1200px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-6); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .quick-stats { display: flex; gap: var(--space-3); margin-bottom: var(--space-6); }
        .quick-stat {
          padding: var(--space-4) var(--space-6);
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          text-align: center;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .quick-stat:hover { border-color: var(--glass-border-hover); background: var(--glass-bg-hover); }
        .quick-stat--active { border-color: var(--accent-primary); background: var(--accent-primary-subtle); }
        .quick-stat__value { display: block; font-size: var(--text-xl); font-weight: 600; }
        .quick-stat__label { display: block; font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-1); }

        .search-bar {
          position: relative;
          margin-bottom: var(--space-6);
        }
        .search-bar__icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary);
        }
        .search-bar__input {
          width: 100%;
          padding: 14px 16px 14px 44px;
          font-size: var(--text-base);
          background: var(--glass-bg);
          backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          color: var(--text-primary);
          transition: all var(--duration-fast) var(--ease-out);
        }
        .search-bar__input::placeholder { color: var(--text-quaternary); }
        .search-bar__input:hover { border-color: var(--glass-border-hover); }
        .search-bar__input:focus { outline: none; border-color: var(--accent-primary); box-shadow: var(--shadow-focus); }

        .table-card { padding: 0; overflow: hidden; }

        .cafe-cell { display: flex; align-items: center; gap: var(--space-3); }
        .cafe-cell__avatar {
          width: 36px; height: 36px;
          background: var(--accent-primary-subtle);
          border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center;
          color: var(--accent-primary);
        }
        .cafe-cell__name { font-weight: 500; }

        .location-cell, .pcs-cell {
          display: flex; align-items: center; gap: var(--space-2);
          color: var(--text-secondary);
        }
      `}</style>
        </div>
    );
}
