import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft, Building2, Monitor, Wifi, WifiOff, AlertCircle, Clock,
    User, Mail, Phone, MapPin, CreditCard, Edit, Power, RefreshCw, X, Lock, MessageSquare,
} from 'lucide-react';
import useAuthStore, { PERMISSIONS } from '../stores/authStore';


const mockCafeData = {
    1: {
        id: 1, name: 'GameZone Pro', owner_name: 'Rahul Sharma', owner_email: 'rahul@gamezone.in', owner_phone: '+91 98765 43210', location: 'Mumbai, Maharashtra', address: '123 Gaming Street, Andheri West, Mumbai 400053', status: 'subscribed_active', plan: 'Enterprise', mrr: 22500, licensed_pcs: 50, registered_at: '2024-06-15',
        pcs: [
            { id: 1, name: 'PC-001', status: 'online', current_user: 'player_42', last_heartbeat: Date.now() - 30000, license: 'ENT-001' },
            { id: 2, name: 'PC-002', status: 'online', current_user: null, last_heartbeat: Date.now() - 45000, license: 'ENT-002' },
            { id: 3, name: 'PC-003', status: 'offline', current_user: null, last_heartbeat: Date.now() - 3600000, license: 'ENT-003' },
            { id: 4, name: 'PC-004', status: 'online', current_user: 'gamer_pro', last_heartbeat: Date.now() - 15000, license: 'ENT-004' },
            { id: 5, name: 'PC-005', status: 'warning', current_user: null, last_heartbeat: Date.now() - 120000, license: 'ENT-005', warning: 'Outdated client' },
            { id: 6, name: 'PC-006', status: 'online', current_user: null, last_heartbeat: Date.now() - 20000, license: 'ENT-006' },
        ],
    },
    2: {
        id: 2, name: 'CyberCafe Elite', owner_name: 'Priya Patel', owner_email: 'priya@cyberelite.com', owner_phone: '+91 87654 32109', location: 'Bangalore, Karnataka', address: '456 Tech Park, Electronic City, Bangalore 560100', status: 'subscribed_active', plan: 'Professional', mrr: 14000, licensed_pcs: 30, registered_at: '2024-08-22',
        pcs: [
            { id: 7, name: 'CYBER-01', status: 'online', current_user: 'user_1', last_heartbeat: Date.now() - 10000, license: 'PRO-001' },
            { id: 8, name: 'CYBER-02', status: 'online', current_user: null, last_heartbeat: Date.now() - 25000, license: 'PRO-002' },
            { id: 9, name: 'CYBER-03', status: 'offline', current_user: null, last_heartbeat: Date.now() - 7200000, license: 'PRO-003' },
        ],
    },
    3: {
        id: 3, name: 'Pixel Paradise', owner_name: 'Amit Kumar', owner_email: 'amit@pixelparadise.in', owner_phone: '+91 76543 21098', location: 'Delhi', address: '789 Game Zone, Connaught Place, New Delhi 110001', status: 'trial_active', plan: 'Trial', mrr: 0, licensed_pcs: 15, registered_at: '2024-11-10',
        pcs: [
            { id: 10, name: 'PIXEL-A1', status: 'online', current_user: 'trial_user', last_heartbeat: Date.now() - 5000, license: 'TRIAL-001' },
            { id: 11, name: 'PIXEL-A2', status: 'online', current_user: null, last_heartbeat: Date.now() - 35000, license: 'TRIAL-002' },
        ],
    },
};

const STATUS_CONFIG = {
    online: { label: 'Online', color: 'success' },
    offline: { label: 'Offline', color: 'neutral' },
    warning: { label: 'Warning', color: 'warning' },
};

const CAFE_STATUS = {
    trial_active: { label: 'Trial', color: 'info' },
    subscribed_active: { label: 'Active', color: 'success' },
    subscribed_payment_due: { label: 'Payment Due', color: 'warning' },
    suspended: { label: 'Suspended', color: 'danger' },
    churned: { label: 'Churned', color: 'neutral' },
};

export default function CafeDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasPermission, isSuperAdmin } = useAuthStore();

    const [cafe, setCafe] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPC, setSelectedPC] = useState(null);
    const [showCommandModal, setShowCommandModal] = useState(false);

    const canEdit = hasPermission(PERMISSIONS.EDIT_CAFE_DETAILS) || isSuperAdmin();
    const canRemoteAccess = hasPermission(PERMISSIONS.REMOTE_PC_ACCESS) || isSuperAdmin();
    const canExecuteCommands = hasPermission(PERMISSIONS.EXECUTE_PC_COMMANDS) || isSuperAdmin();

    useEffect(() => {
        setTimeout(() => {
            const cafeData = mockCafeData[id];
            if (cafeData) setCafe(cafeData);
            setIsLoading(false);
        }, 300);
    }, [id]);

    const formatTimeAgo = (ts) => {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    };

    const formatCurrency = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

    const handlePCClick = (pc) => {
        if (canRemoteAccess && pc.status === 'online') {
            setSelectedPC(pc);
            setShowCommandModal(true);
        }
    };

    const executeCommand = (cmd) => {
        console.log(`Executing ${cmd} on ${selectedPC?.name}`);
        setShowCommandModal(false);
        setSelectedPC(null);
    };

    if (isLoading) return <div className="loading-state"><div className="spinner" /></div>;

    if (!cafe) return (
        <div className="empty-state">
            <Building2 size={48} />
            <p>Café not found</p>
            <button className="btn btn--secondary" onClick={() => navigate('/cafes')}>Back to Cafés</button>
        </div>
    );

    const cafeStatus = CAFE_STATUS[cafe.status];
    const pcStats = {
        total: cafe.pcs.length,
        online: cafe.pcs.filter(p => p.status === 'online').length,
        offline: cafe.pcs.filter(p => p.status === 'offline').length,
        warning: cafe.pcs.filter(p => p.status === 'warning').length,
        inSession: cafe.pcs.filter(p => p.current_user).length,
    };

    return (
        <div className="cafe-detail">
            <Link to="/cafes" className="back-link"><ArrowLeft size={16} /><span>Cafés</span></Link>

            <div className="cafe-header">
                <div className="cafe-header__main">
                    <h1 className="cafe-header__title">{cafe.name}</h1>
                    <span className={`badge badge--${cafeStatus?.color}`}>{cafeStatus?.label}</span>
                </div>
                {canEdit && (
                    <button className="btn btn--secondary" onClick={() => navigate(`/cafes/${id}/edit`)}>
                        <Edit size={16} /> Edit
                    </button>
                )}
            </div>

            {/* Info Cards */}
            <div className="info-grid">
                <div className="info-card glass-card">
                    <h3 className="info-card__title">Owner</h3>
                    <div className="info-card__list">
                        <div className="info-item"><User size={16} /><span>{cafe.owner_name}</span></div>
                        <div className="info-item"><Mail size={16} /><span>{cafe.owner_email}</span></div>
                        <div className="info-item"><Phone size={16} /><span>{cafe.owner_phone}</span></div>
                    </div>
                </div>
                <div className="info-card glass-card">
                    <h3 className="info-card__title">Location</h3>
                    <div className="info-card__list">
                        <div className="info-item"><MapPin size={16} /><span>{cafe.address}</span></div>
                    </div>
                </div>
                <div className="info-card glass-card">
                    <h3 className="info-card__title">Subscription</h3>
                    <div className="info-card__list">
                        <div className="info-item"><CreditCard size={16} /><span>{cafe.plan} • {formatCurrency(cafe.mrr)}/mo</span></div>
                        <div className="info-item"><Monitor size={16} /><span>{cafe.licensed_pcs} licensed PCs</span></div>
                    </div>
                </div>
            </div>

            {/* PC Section */}
            <div className="pcs-section">
                <div className="pcs-header">
                    <div>
                        <h2 className="pcs-header__title">Registered PCs</h2>
                        <p className="pcs-header__subtitle">
                            <span className="status-dot status-dot--online" /> {pcStats.online} online
                            <span className="status-dot status-dot--active" style={{ marginLeft: 16 }} /> {pcStats.inSession} in session
                        </p>
                    </div>
                </div>

                <div className="pcs-grid">
                    {cafe.pcs.map((pc) => {
                        const statusCfg = STATUS_CONFIG[pc.status];
                        const isClickable = canRemoteAccess && pc.status === 'online';
                        return (
                            <div key={pc.id} className={`pc-card glass-card ${isClickable ? 'pc-card--clickable' : ''}`} onClick={() => handlePCClick(pc)}>
                                <div className="pc-card__header">
                                    <div className="pc-card__name"><Monitor size={18} /><span>{pc.name}</span></div>
                                    <span className={`badge badge--${statusCfg?.color}`}>{statusCfg?.label}</span>
                                </div>
                                <div className="pc-card__body">
                                    {pc.current_user ? (
                                        <div className="pc-card__user"><User size={14} /><span>{pc.current_user}</span></div>
                                    ) : (
                                        <div className="pc-card__idle">Idle</div>
                                    )}
                                    <div className="pc-card__meta">
                                        <span className="pc-card__heartbeat"><Wifi size={12} />{formatTimeAgo(pc.last_heartbeat)}</span>
                                        <span className="pc-card__license">{pc.license}</span>
                                    </div>
                                </div>
                                {pc.warning && (
                                    <div className="pc-card__warning"><AlertCircle size={12} />{pc.warning}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Command Modal */}
            {showCommandModal && selectedPC && (
                <div className="modal-backdrop" onClick={() => setShowCommandModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal__header">
                            <h2 className="modal__title">Remote Access: {selectedPC.name}</h2>
                            <button className="modal__close" onClick={() => setShowCommandModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal__body">
                            <p className="modal-info">Choose an action to execute on this PC.</p>
                            <div className="command-grid">
                                <button className="command-btn" onClick={() => executeCommand('shutdown')} disabled={!canExecuteCommands}>
                                    <Power size={20} /><span>Shutdown</span>
                                </button>
                                <button className="command-btn" onClick={() => executeCommand('restart')} disabled={!canExecuteCommands}>
                                    <RefreshCw size={20} /><span>Restart</span>
                                </button>
                                <button className="command-btn" onClick={() => executeCommand('lock')} disabled={!canExecuteCommands}>
                                    <Lock size={20} /><span>Lock</span>
                                </button>
                                <button className="command-btn" onClick={() => executeCommand('message')} disabled={!canExecuteCommands}>
                                    <MessageSquare size={20} /><span>Message</span>
                                </button>
                            </div>
                            <p className="modal-notice">All commands are logged for audit purposes.</p>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .cafe-detail { max-width: 1200px; }
        .loading-state { display: flex; align-items: center; justify-content: center; min-height: 50vh; }
        .back-link {
          display: inline-flex; align-items: center; gap: var(--space-2);
          color: var(--text-secondary); font-size: var(--text-sm);
          margin-bottom: var(--space-6); transition: color var(--duration-fast) var(--ease-out);
        }
        .back-link:hover { color: var(--accent-primary); }

        .cafe-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-8); }
        .cafe-header__main { display: flex; align-items: center; gap: var(--space-4); }
        .cafe-header__title { font-size: var(--text-2xl); font-weight: 600; letter-spacing: -0.02em; }

        .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); margin-bottom: var(--space-10); }
        .info-card { padding: var(--space-6); }
        .info-card__title {
          font-size: var(--text-xs); font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: var(--space-4);
        }
        .info-card__list { display: flex; flex-direction: column; gap: var(--space-3); }
        .info-item { display: flex; align-items: flex-start; gap: var(--space-3); font-size: var(--text-sm); color: var(--text-secondary); }
        .info-item svg { color: var(--text-tertiary); flex-shrink: 0; margin-top: 1px; }

        .pcs-section { margin-top: var(--space-8); }
        .pcs-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
        .pcs-header__title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-2); }
        .pcs-header__subtitle { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-tertiary); }

        .pcs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-5); }
        .pc-card { padding: var(--space-5); transition: all var(--duration-fast) var(--ease-out); }
        .pc-card--clickable { cursor: pointer; }
        .pc-card--clickable:hover { border-color: var(--accent-primary); transform: translateY(-2px); box-shadow: var(--shadow-lg), 0 0 30px rgba(59,130,246,0.1); }

        .pc-card__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
        .pc-card__name { display: flex; align-items: center; gap: var(--space-2); font-weight: 500; }
        .pc-card__name svg { color: var(--text-tertiary); }
        .pc-card__body { display: flex; flex-direction: column; gap: var(--space-3); }
        .pc-card__user { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--accent-primary); }
        .pc-card__idle { font-size: var(--text-sm); color: var(--text-tertiary); }
        .pc-card__meta { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-tertiary); }
        .pc-card__heartbeat { display: flex; align-items: center; gap: var(--space-1); }
        .pc-card__license { font-family: var(--font-mono); }
        .pc-card__warning {
          display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3);
          padding: var(--space-3); background: var(--status-warning-subtle);
          border-radius: var(--radius-sm); font-size: var(--text-xs); color: var(--status-warning);
        }

        .modal-info { color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-6); }
        .command-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); }
        .command-btn {
          display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
          padding: var(--space-6); background: var(--glass-bg); border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg); color: var(--text-secondary); font-size: var(--text-sm);
          cursor: pointer; transition: all var(--duration-fast) var(--ease-out);
        }
        .command-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--accent-primary-subtle); }
        .command-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-notice { margin-top: var(--space-6); font-size: var(--text-xs); color: var(--text-tertiary); text-align: center; }

        @media (max-width: 1024px) { .info-grid, .pcs-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 640px) { .info-grid, .pcs-grid { grid-template-columns: 1fr; } }
      `}</style>
        </div>
    );
}
