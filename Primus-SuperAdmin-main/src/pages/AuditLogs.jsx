import { useState, useEffect, useMemo } from 'react';
import { FileText, Search, Filter, Download, Calendar, User, Activity, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';
import api from '../api/client';

const SEVERITY_CONFIG = { info: 'neutral', warning: 'warning', danger: 'danger' };
const ACTION_CONFIG = {
  login: { label: 'Login', icon: User },
  login_success: { label: 'Login', icon: User },
  login_failed: { label: 'Login Failed', icon: User },
  login_denied: { label: 'Access Denied', icon: User },
  logout: { label: 'Logout', icon: User },
  update: { label: 'Update', icon: Activity },
  command: { label: 'Command', icon: Activity },
  pc_command: { label: 'Remote Command', icon: Activity },
  view: { label: 'View', icon: FileText },
  create: { label: 'Create', icon: Activity },
  user_create: { label: 'User Created', icon: User },
  password_change: { label: 'Password Change', icon: User },
  alert: { label: 'Alert', icon: Activity },
  suspend: { label: 'Suspend', icon: Activity },
  export: { label: 'Export', icon: Download },
  user_export: { label: 'User Export', icon: Download },
};

export default function AuditLogs() {
  const { hasPermission, isSuperAdmin } = useAuthStore();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const canExport = hasPermission(PERMISSIONS.EXPORT_REPORTS) || isSuperAdmin();

  // Fetch audit logs from API
  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/audit/');
      // Transform API data to match UI
      const transformedLogs = (response.data || []).map(log => ({
        id: log.id,
        timestamp: log.timestamp || log.created_at,
        user: log.user_email || log.user_id || 'System',
        action: log.action,
        target: log.detail?.split(' ')[0] || 'System',
        details: log.detail || '',
        severity: log.action?.includes('failed') || log.action?.includes('denied') ? 'danger' :
          log.action?.includes('suspend') || log.action?.includes('command') ? 'warning' : 'info',
        ip: log.ip,
      }));
      setLogs(transformedLogs);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
      setError(err.response?.data?.detail || 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = useMemo(() => {
    let result = [...logs];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        String(l.user).toLowerCase().includes(q) ||
        String(l.target).toLowerCase().includes(q) ||
        String(l.details).toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') result = result.filter(l => l.severity === severityFilter);
    return result;
  }, [logs, searchQuery, severityFilter]);

  return (
    <div className="audit-logs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Activity history and system events</p>
        </div>
        {canExport && <button className="btn btn--secondary"><Download size={16} /> Export</button>}
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="search-bar">
          <Search size={16} className="search-bar__icon" />
          <input type="text" placeholder="Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-bar__input" />
        </div>
        <div className="filter-tabs">
          {['all', 'info', 'warning', 'danger'].map(sev => (
            <button key={sev} className={`filter-tab ${severityFilter === sev ? 'filter-tab--active' : ''}`} onClick={() => setSeverityFilter(sev)}>
              {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Log List */}
      <div className="logs-list">
        {filtered.map(log => {
          const ActionIcon = ACTION_CONFIG[log.action]?.icon || Activity;
          return (
            <div key={log.id} className={`log-item glass-card log-item--${log.severity}`}>
              <div className="log-item__icon"><ActionIcon size={18} /></div>
              <div className="log-item__content">
                <div className="log-item__header">
                  <span className="log-item__action">{ACTION_CONFIG[log.action]?.label || log.action}</span>
                  <span className="log-item__target">{log.target}</span>
                </div>
                <p className="log-item__details">{log.details}</p>
                <div className="log-item__meta">
                  <span className="log-item__user"><User size={12} /> {log.user}</span>
                  <span className="log-item__time"><Calendar size={12} /> {log.timestamp}</span>
                </div>
              </div>
              <span className={`badge badge--${SEVERITY_CONFIG[log.severity]}`}>{log.severity}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .audit-logs { max-width: 900px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-6); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .filters-row { display: flex; gap: var(--space-4); margin-bottom: var(--space-6); align-items: center; }
        .search-bar { position: relative; flex: 1; max-width: 320px; }
        .search-bar__icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); }
        .search-bar__input {
          width: 100%; padding: 12px 14px 12px 40px; font-size: var(--text-sm);
          background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); color: var(--text-primary);
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

        .logs-list { display: flex; flex-direction: column; gap: var(--space-4); }
        .log-item { display: flex; gap: var(--space-4); padding: var(--space-5); align-items: flex-start; }
        .log-item--warning { border-left: 3px solid var(--status-warning); }
        .log-item--danger { border-left: 3px solid var(--status-danger); }

        .log-item__icon {
          width: 36px; height: 36px; background: rgba(255,255,255,0.06);
          border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;
          color: var(--text-tertiary); flex-shrink: 0;
        }
        .log-item__content { flex: 1; min-width: 0; }
        .log-item__header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
        .log-item__action { font-weight: 600; font-size: var(--text-sm); }
        .log-item__target { font-size: var(--text-sm); color: var(--text-secondary); }
        .log-item__details { font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-3); }
        .log-item__meta { display: flex; gap: var(--space-4); font-size: var(--text-xs); color: var(--text-quaternary); }
        .log-item__user, .log-item__time { display: flex; align-items: center; gap: var(--space-1); }
      `}</style>
    </div>
  );
}
