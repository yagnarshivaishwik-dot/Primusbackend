import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Monitor,
    Search,
    Filter,
    Download,
    ChevronDown,
    ChevronUp,
    Eye,
    Terminal,
    Power,
    RefreshCw,
    Wifi,
    WifiOff,
    AlertCircle,
    MoreHorizontal,
    X,
    Activity,
    Loader2,
} from 'lucide-react';
import api from '../api/client';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';

const STATUS_CONFIG = {
    online: { label: 'Online', color: 'success', icon: Wifi },
    offline: { label: 'Offline', color: 'neutral', icon: WifiOff },
    warning: { label: 'Warning', color: 'warning', icon: AlertCircle },
};

export default function PCRegistry() {
    const navigate = useNavigate();
    const { hasPermission, isSuperAdmin } = useAuthStore();

    const [pcs, setPCs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [cafeFilter, setCafeFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'cafe_id', direction: 'asc' });
    const [selectedPC, setSelectedPC] = useState(null);
    const [showCommandModal, setShowCommandModal] = useState(false);

    const canRemoteAccess = hasPermission(PERMISSIONS.REMOTE_PC_ACCESS) || isSuperAdmin();
    const canExecuteCommands = hasPermission(PERMISSIONS.EXECUTE_PC_COMMANDS) || isSuperAdmin();

    // Fetch PCs from API
    const fetchPCs = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get('/clientpc/');
            // Transform API data to match UI expectations
            const transformedPCs = (response.data || []).map(pc => ({
                id: pc.id,
                name: pc.name || `PC-${pc.id}`,
                cafe_id: pc.cafe_id,
                cafe_name: `Café ${pc.cafe_id}`, // Will be populated from café lookup if needed
                status: pc.status || 'offline',
                os: pc.os || 'Unknown',
                client_version: pc.client_version || 'Unknown',
                last_heartbeat: pc.last_seen,
                ip_address: pc.ip_address || 'N/A',
                uptime_hours: 0,
                current_user: null,
                hardware_fingerprint: pc.hardware_fingerprint,
                license_key: pc.license_key,
            }));
            setPCs(transformedPCs);
        } catch (err) {
            console.error('Failed to fetch PCs:', err);
            setError(err.response?.data?.detail || 'Failed to load PCs');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPCs();
        // Refresh every 30 seconds for live status
        const interval = setInterval(fetchPCs, 30000);
        return () => clearInterval(interval);
    }, []);

    // Get unique cafes for filter
    const uniqueCafes = useMemo(() => {
        const cafes = new Map();
        pcs.forEach((pc) => {
            if (!cafes.has(pc.cafe_id)) {
                cafes.set(pc.cafe_id, pc.cafe_name);
            }
        });
        return Array.from(cafes.entries());
    }, [pcs]);

    // Filter and sort PCs
    const filteredPCs = useMemo(() => {
        let result = [...pcs];

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(
                (pc) =>
                    pc.name.toLowerCase().includes(query) ||
                    pc.cafe_name.toLowerCase().includes(query) ||
                    pc.ip_address.includes(query)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter((pc) => pc.status === statusFilter);
        }

        // Cafe filter
        if (cafeFilter !== 'all') {
            result = result.filter((pc) => pc.cafe_id === parseInt(cafeFilter));
        }

        // Sort
        result.sort((a, b) => {
            let aValue = a[sortConfig.key];
            let bValue = b[sortConfig.key];

            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [pcs, searchQuery, statusFilter, cafeFilter, sortConfig]);

    const handleSort = (key) => {
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const formatTimeAgo = (isoString) => {
        const date = new Date(isoString);
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    const handleRemoteAccess = (pc) => {
        setSelectedPC(pc);
        setShowCommandModal(true);
    };

    const executeCommand = async (command) => {
        if (!selectedPC) return;

        try {
            // TODO: Implement actual command execution
            console.log(`Executing ${command} on ${selectedPC.name}`);
            // await api.post(`/internal/pcs/${selectedPC.id}/command`, { command });
        } catch (error) {
            console.error('Command failed:', error);
        }
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return null;
        return sortConfig.direction === 'asc' ? (
            <ChevronUp size={14} />
        ) : (
            <ChevronDown size={14} />
        );
    };

    // Stats
    const stats = useMemo(() => ({
        total: pcs.length,
        online: pcs.filter((p) => p.status === 'online').length,
        offline: pcs.filter((p) => p.status === 'offline').length,
        warning: pcs.filter((p) => p.status === 'warning').length,
    }), [pcs]);

    return (
        <div className="pc-registry">
            {/* Page Header */}
            <div className="page-header">
                <div className="page-header-content">
                    <div className="page-header-icon">
                        <Monitor size={24} />
                    </div>
                    <div>
                        <h1 className="page-title">PC Registry</h1>
                        <p className="page-subtitle">
                            {stats.online} online, {stats.offline} offline, {stats.warning} warnings
                        </p>
                    </div>
                </div>
                <div className="page-header-actions">
                    <button className="btn btn--ghost" onClick={() => setIsLoading(true)}>
                        <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="pc-stats">
                <div className="pc-stat pc-stat--total" onClick={() => setStatusFilter('all')}>
                    <Activity size={20} />
                    <span className="pc-stat-value">{stats.total}</span>
                    <span className="pc-stat-label">Total PCs</span>
                </div>
                <div className="pc-stat pc-stat--online" onClick={() => setStatusFilter('online')}>
                    <Wifi size={20} />
                    <span className="pc-stat-value">{stats.online}</span>
                    <span className="pc-stat-label">Online</span>
                </div>
                <div className="pc-stat pc-stat--offline" onClick={() => setStatusFilter('offline')}>
                    <WifiOff size={20} />
                    <span className="pc-stat-value">{stats.offline}</span>
                    <span className="pc-stat-label">Offline</span>
                </div>
                <div className="pc-stat pc-stat--warning" onClick={() => setStatusFilter('warning')}>
                    <AlertCircle size={20} />
                    <span className="pc-stat-value">{stats.warning}</span>
                    <span className="pc-stat-label">Warnings</span>
                </div>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="search-wrapper">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by PC name, café, or IP..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-input"
                    />
                    {searchQuery && (
                        <button className="search-clear" onClick={() => setSearchQuery('')}>
                            <X size={16} />
                        </button>
                    )}
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="filter-select"
                >
                    <option value="all">All Statuses</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="warning">Warning</option>
                </select>

                <select
                    value={cafeFilter}
                    onChange={(e) => setCafeFilter(e.target.value)}
                    className="filter-select"
                >
                    <option value="all">All Cafés</option>
                    {uniqueCafes.map(([id, name]) => (
                        <option key={id} value={id}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            {/* PC Grid/Table */}
            <div className="table-wrapper">
                <table className="data-table pc-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th className="th-sortable" onClick={() => handleSort('name')}>
                                PC Name <SortIcon column="name" />
                            </th>
                            <th className="th-sortable" onClick={() => handleSort('cafe_name')}>
                                Café <SortIcon column="cafe_name" />
                            </th>
                            <th>IP Address</th>
                            <th>OS / Client</th>
                            <th className="th-sortable" onClick={() => handleSort('last_heartbeat')}>
                                Last Seen <SortIcon column="last_heartbeat" />
                            </th>
                            <th>Current User</th>
                            <th className="th-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPCs.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="empty-state">
                                    <div className="empty-state-content">
                                        <Monitor size={48} strokeWidth={1} />
                                        <p>No PCs found matching your criteria</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredPCs.map((pc) => {
                                const statusConfig = STATUS_CONFIG[pc.status];
                                const StatusIcon = statusConfig?.icon || Activity;

                                return (
                                    <tr key={pc.id} className="pc-row">
                                        <td>
                                            <div className={`status-indicator status-indicator--${pc.status}`}>
                                                <div className={`status-dot status-dot--${pc.status === 'online' ? 'online' : pc.status === 'warning' ? 'warning' : 'offline'}`} />
                                                <span>{statusConfig?.label}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="pc-name">{pc.name}</span>
                                        </td>
                                        <td>
                                            <a
                                                href={`/cafes/${pc.cafe_id}`}
                                                className="cafe-link"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    navigate(`/cafes/${pc.cafe_id}`);
                                                }}
                                            >
                                                {pc.cafe_name}
                                            </a>
                                        </td>
                                        <td>
                                            <code className="ip-address">{pc.ip_address}</code>
                                        </td>
                                        <td>
                                            <div className="os-info">
                                                <span className="os-name">{pc.os}</span>
                                                <span className="client-version">v{pc.client_version}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`last-seen ${pc.status === 'offline' ? 'last-seen--stale' : ''}`}>
                                                {formatTimeAgo(pc.last_heartbeat)}
                                            </span>
                                        </td>
                                        <td>
                                            {pc.current_user ? (
                                                <span className="current-user">{pc.current_user}</span>
                                            ) : (
                                                <span className="no-user">—</span>
                                            )}
                                        </td>
                                        <td className="td-center">
                                            <div className="action-buttons">
                                                <button
                                                    className="action-btn"
                                                    title="View Details"
                                                    onClick={() => navigate(`/pcs/${pc.id}`)}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                {canRemoteAccess && pc.status === 'online' && (
                                                    <button
                                                        className="action-btn action-btn--primary"
                                                        title="Remote Access"
                                                        onClick={() => handleRemoteAccess(pc)}
                                                    >
                                                        <Terminal size={16} />
                                                    </button>
                                                )}
                                                <button className="action-btn" title="More Actions">
                                                    <MoreHorizontal size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Command Modal */}
            {showCommandModal && selectedPC && (
                <div className="modal-backdrop" onClick={() => setShowCommandModal(false)}>
                    <div className="modal command-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal__header">
                            <h2 className="modal__title">
                                Remote Access: {selectedPC.name}
                            </h2>
                            <button
                                className="modal__close"
                                onClick={() => setShowCommandModal(false)}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="command-modal-content">
                            <div className="pc-info-bar">
                                <span><strong>Café:</strong> {selectedPC.cafe_name}</span>
                                <span><strong>IP:</strong> {selectedPC.ip_address}</span>
                                <span><strong>OS:</strong> {selectedPC.os}</span>
                            </div>

                            <div className="command-grid">
                                <button
                                    className="command-btn"
                                    onClick={() => executeCommand('shutdown')}
                                    disabled={!canExecuteCommands}
                                >
                                    <Power size={24} />
                                    <span>Shutdown</span>
                                </button>
                                <button
                                    className="command-btn"
                                    onClick={() => executeCommand('restart')}
                                    disabled={!canExecuteCommands}
                                >
                                    <RefreshCw size={24} />
                                    <span>Restart</span>
                                </button>
                                <button
                                    className="command-btn"
                                    onClick={() => executeCommand('lock')}
                                    disabled={!canExecuteCommands}
                                >
                                    <Monitor size={24} />
                                    <span>Lock Screen</span>
                                </button>
                                <button
                                    className="command-btn"
                                    onClick={() => executeCommand('message')}
                                    disabled={!canExecuteCommands}
                                >
                                    <Terminal size={24} />
                                    <span>Send Message</span>
                                </button>
                            </div>

                            <div className="command-warning">
                                <AlertCircle size={16} />
                                <span>All commands are logged for audit purposes.</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .pc-registry {
          max-width: 1600px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-xl);
        }

        .page-header-content {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .page-header-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--accent-purple), var(--accent-magenta));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--bg-void);
        }

        .page-title {
          font-size: var(--text-2xl);
          font-weight: 700;
          margin-bottom: var(--space-xs);
        }

        .page-subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        /* PC Stats */
        .pc-stats {
          display: flex;
          gap: var(--space-md);
          margin-bottom: var(--space-lg);
        }

        .pc-stat {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-md) var(--space-lg);
          background: var(--bg-glass);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .pc-stat:hover {
          border-color: var(--border-hover);
          transform: translateY(-2px);
        }

        .pc-stat--total { color: var(--text-secondary); }
        .pc-stat--online { color: var(--status-success); }
        .pc-stat--offline { color: var(--text-muted); }
        .pc-stat--warning { color: var(--status-warning); }

        .pc-stat-value {
          font-size: var(--text-xl);
          font-weight: 700;
          font-family: var(--font-mono);
        }

        .pc-stat-label {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        /* Filters */
        .filters-bar {
          display: flex;
          gap: var(--space-md);
          margin-bottom: var(--space-lg);
          flex-wrap: wrap;
        }

        .search-wrapper {
          position: relative;
          flex: 1;
          min-width: 280px;
          max-width: 400px;
        }

        .search-icon {
          position: absolute;
          left: var(--space-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary);
        }

        .search-input {
          width: 100%;
          padding: var(--space-sm) var(--space-md);
          padding-left: calc(var(--space-md) + 18px + var(--space-sm));
          font-family: var(--font-sans);
          font-size: var(--text-sm);
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
        }

        .search-input:focus {
          outline: none;
          border-color: var(--accent-cyan);
        }

        .search-clear {
          position: absolute;
          right: var(--space-sm);
          top: 50%;
          transform: translateY(-50%);
          padding: var(--space-xs);
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
        }

        .filter-select {
          padding: var(--space-sm) var(--space-lg) var(--space-sm) var(--space-md);
          font-family: var(--font-sans);
          font-size: var(--text-sm);
          color: var(--text-primary);
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          cursor: pointer;
        }

        /* Table */
        .table-wrapper {
          background: var(--bg-glass);
          backdrop-filter: blur(20px);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .pc-table {
          min-width: 1000px;
        }

        .th-sortable {
          cursor: pointer;
        }

        .th-center {
          text-align: center;
        }

        .td-center {
          text-align: center;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-size: var(--text-sm);
        }

        .status-indicator--online { color: var(--status-success); }
        .status-indicator--offline { color: var(--text-muted); }
        .status-indicator--warning { color: var(--status-warning); }

        .pc-name {
          font-weight: 500;
          font-family: var(--font-mono);
        }

        .cafe-link {
          color: var(--accent-cyan);
        }

        .cafe-link:hover {
          text-decoration: underline;
        }

        .ip-address {
          font-family: var(--font-mono);
          font-size: var(--text-sm);
          padding: 2px 6px;
          background: var(--bg-secondary);
          border-radius: var(--radius-sm);
        }

        .os-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .os-name {
          font-size: var(--text-sm);
        }

        .client-version {
          font-size: var(--text-xs);
          color: var(--text-muted);
          font-family: var(--font-mono);
        }

        .last-seen {
          font-size: var(--text-sm);
        }

        .last-seen--stale {
          color: var(--text-muted);
        }

        .current-user {
          font-size: var(--text-sm);
          color: var(--accent-cyan);
        }

        .no-user {
          color: var(--text-muted);
        }

        .action-buttons {
          display: flex;
          gap: var(--space-xs);
          justify-content: center;
        }

        .action-btn {
          padding: var(--space-xs);
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .action-btn:hover {
          color: var(--accent-cyan);
          border-color: var(--accent-cyan);
        }

        .action-btn--primary {
          background: rgba(0, 240, 255, 0.1);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
        }

        .empty-state {
          padding: var(--space-3xl) !important;
        }

        .empty-state-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-md);
          color: var(--text-muted);
        }

        /* Command Modal */
        .command-modal {
          width: 500px;
        }

        .command-modal-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .pc-info-bar {
          display: flex;
          gap: var(--space-lg);
          padding: var(--space-md);
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
        }

        .command-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-md);
        }

        .command-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-lg);
          background: var(--bg-glass);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .command-btn:hover:not(:disabled) {
          color: var(--accent-cyan);
          border-color: var(--accent-cyan);
          background: rgba(0, 240, 255, 0.1);
        }

        .command-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .command-warning {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-md);
          background: var(--status-warning-bg);
          border: 1px solid rgba(255, 170, 0, 0.3);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          color: var(--status-warning);
        }

        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
        </div>
    );
}
