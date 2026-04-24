import { useState, useEffect, useMemo } from 'react';
import { CreditCard, DollarSign, Clock, AlertCircle, CheckCircle, Search, Filter, Download, ArrowUpRight, ChevronRight, Loader2, RefreshCw } from 'lucide-react';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';
import api from '../api/client';

const STATUS_CONFIG = {
    active: { label: 'Active', color: 'success', icon: CheckCircle },
    trial: { label: 'Trial', color: 'info', icon: Clock },
    expiring: { label: 'Expiring', color: 'warning', icon: Clock },
    expired: { label: 'Expired', color: 'danger', icon: AlertCircle },
    none: { label: 'No License', color: 'neutral', icon: null },
};

export default function Subscriptions() {
    const { hasPermission, isSuperAdmin } = useAuthStore();
    const [subscriptions, setSubscriptions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const canExport = hasPermission(PERMISSIONS.EXPORT_REPORTS) || isSuperAdmin();

    // Fetch subscriptions from API
    const fetchSubscriptions = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Get licenses from API
            const response = await api.get('/license/');
            // Transform to subscription format
            const transformedSubs = (response.data || []).map(lic => ({
                id: lic.id,
                cafe: lic.cafe_name || `Café ${lic.cafe_id}`,
                plan: lic.max_pcs >= 50 ? 'Enterprise' : lic.max_pcs >= 20 ? 'Professional' : 'Starter',
                status: !lic.is_active ? 'expired' :
                    lic.expires_at && new Date(lic.expires_at) < new Date() ? 'expired' :
                        lic.expires_at && new Date(lic.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'expiring' : 'active',
                mrr: lic.max_pcs * 500, // Estimated pricing
                billingCycle: 'monthly',
                nextBilling: lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : '-',
                paymentMethod: 'Card',
                key: lic.key,
            }));
            setSubscriptions(transformedSubs);
        } catch (err) {
            console.error('Failed to fetch subscriptions:', err);
            setError(err.response?.data?.detail || 'Failed to load subscriptions');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscriptions();
    }, []);

    const filtered = useMemo(() => {
        let result = [...subscriptions];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(s => s.cafe?.toLowerCase().includes(q) || s.plan?.toLowerCase().includes(q));
        }
        if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
        return result;
    }, [subscriptions, searchQuery, statusFilter]);

    const stats = useMemo(() => ({
        totalMrr: subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.mrr || 0), 0),
        activeCount: subscriptions.filter(s => s.status === 'active').length,
        trialCount: subscriptions.filter(s => s.status === 'trial').length,
        overdueCount: subscriptions.filter(s => s.status === 'expired' || s.status === 'expiring').length,
    }), [subscriptions]);

    const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

    return (
        <div className="subscriptions">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Subscriptions</h1>
                    <p className="page-subtitle">Manage billing and revenue streams</p>
                </div>
                {canExport && <button className="btn btn--secondary"><Download size={16} /> Export</button>}
            </div>

            {/* Stats */}
            <div className="stats-grid">
                <div className="stat-card stat-card--hero glass-card">
                    <div className="stat-card__icon"><DollarSign size={24} /></div>
                    <div className="stat-card__content">
                        <span className="stat-card__label">Monthly Recurring Revenue</span>
                        <span className="stat-card__value">{formatCurrency(stats.totalMrr)}</span>
                        <div className="stat-card__trend up"><ArrowUpRight size={14} /> 8.3% from last month</div>
                    </div>
                </div>
                <div className="stat-card glass-card">
                    <span className="stat-card__label">Active Subscriptions</span>
                    <span className="stat-card__value">{stats.activeCount}</span>
                </div>
                <div className="stat-card glass-card">
                    <span className="stat-card__label">Active Trials</span>
                    <span className="stat-card__value">{stats.trialCount}</span>
                </div>
                <div className="stat-card glass-card">
                    <span className="stat-card__label">Payment Overdue</span>
                    <span className="stat-card__value text-danger">{stats.overdueCount}</span>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-row">
                <div className="search-bar">
                    <Search size={16} className="search-bar__icon" />
                    <input type="text" placeholder="Search subscriptions..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-bar__input" />
                </div>
                <div className="filter-tabs">
                    {['all', 'active', 'trial', 'overdue'].map(status => (
                        <button key={status} className={`filter-tab ${statusFilter === status ? 'filter-tab--active' : ''}`} onClick={() => setStatusFilter(status)}>
                            {status === 'all' ? 'All' : STATUS_CONFIG[status]?.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="card table-card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Café</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>MRR</th>
                            <th>Billing</th>
                            <th>Next Billing</th>
                            <th>Payment</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((sub) => {
                            const statusCfg = STATUS_CONFIG[sub.status];
                            return (
                                <tr key={sub.id} className="clickable">
                                    <td><span className="font-medium">{sub.cafe}</span></td>
                                    <td><span className="badge badge--primary">{sub.plan}</span></td>
                                    <td><span className={`badge badge--${statusCfg?.color}`}>{statusCfg?.label}</span></td>
                                    <td className="font-mono">{sub.mrr > 0 ? formatCurrency(sub.mrr) : '—'}</td>
                                    <td className="text-secondary">{sub.billingCycle}</td>
                                    <td className="text-secondary">{sub.nextBilling}</td>
                                    <td className="text-secondary">{sub.paymentMethod}</td>
                                    <td><ChevronRight size={16} className="text-tertiary" /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <style>{`
        .subscriptions { max-width: 1200px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-6); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .stats-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: var(--space-5); margin-bottom: var(--space-8); }
        .stat-card { padding: var(--space-6); }
        .stat-card--hero { display: flex; gap: var(--space-5); background: linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.1) 100%); border-color: rgba(59,130,246,0.25); }
        .stat-card__icon { width: 56px; height: 56px; background: var(--accent-primary-subtle); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; color: var(--accent-primary); }
        .stat-card__content { flex: 1; }
        .stat-card__label { display: block; font-size: var(--text-xs); font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); margin-bottom: var(--space-2); }
        .stat-card__value { display: block; font-size: var(--text-3xl); font-weight: 600; letter-spacing: -0.02em; }
        .stat-card__trend { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-xs); font-weight: 500; margin-top: var(--space-2); }
        .stat-card__trend.up { color: var(--status-success); }

        .filters-row { display: flex; gap: var(--space-4); margin-bottom: var(--space-6); align-items: center; }
        .search-bar { position: relative; flex: 1; max-width: 320px; }
        .search-bar__icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); }
        .search-bar__input {
          width: 100%; padding: 12px 14px 12px 40px; font-size: var(--text-sm);
          background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur));
          border: 1px solid var(--glass-border); border-radius: var(--radius-md); color: var(--text-primary);
        }
        .search-bar__input::placeholder { color: var(--text-quaternary); }
        .search-bar__input:focus { outline: none; border-color: var(--accent-primary); box-shadow: var(--shadow-focus); }

        .filter-tabs { display: flex; gap: var(--space-2); }
        .filter-tab {
          padding: var(--space-2) var(--space-4); background: transparent;
          border: 1px solid var(--glass-border); border-radius: var(--radius-md);
          font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .filter-tab:hover { border-color: var(--glass-border-hover); background: var(--glass-bg); }
        .filter-tab--active { background: var(--accent-primary-subtle); border-color: var(--accent-primary); color: var(--accent-primary); }

        .table-card { padding: 0; overflow: hidden; }
        .font-medium { font-weight: 500; }

        @media (max-width: 1024px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>
        </div>
    );
}
