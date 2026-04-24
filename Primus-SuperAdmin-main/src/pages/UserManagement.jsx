import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Search, Shield, Check, X, Edit, Trash2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import useAuthStore, { PERMISSIONS, ALL_PERMISSIONS } from '../stores/authStore';
import api from '../api/client';

const PERMISSION_GROUPS = {
    'Café Management': [PERMISSIONS.VIEW_CAFE_REGISTRY, PERMISSIONS.EDIT_CAFE_DETAILS, PERMISSIONS.SUSPEND_REACTIVATE_CAFES],
    'Billing': [PERMISSIONS.VIEW_SUBSCRIPTIONS, PERMISSIONS.MODIFY_PRICING, PERMISSIONS.TRIGGER_INVOICES],
    'Analytics': [PERMISSIONS.VIEW_FINANCIAL_ANALYTICS, PERMISSIONS.EXPORT_REPORTS],
    'PC Control': [PERMISSIONS.VIEW_PC_HEALTH, PERMISSIONS.REMOTE_PC_ACCESS, PERMISSIONS.EXECUTE_PC_COMMANDS],
    'Administration': [PERMISSIONS.MANAGE_USERS, PERMISSIONS.MANAGE_PERMISSIONS, PERMISSIONS.VIEW_AUDIT_LOGS],
};

export default function UserManagement() {
    const { isSuperAdmin } = useAuthStore();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);

    // Fetch users from API - only internal admin users
    const fetchUsers = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await api.get('/user/');
            // Filter to only show admin/superadmin users (internal team)
            // Exclude client users who are café customers
            const adminUsers = (response.data || []).filter(user =>
                user.role === 'superadmin' || user.role === 'admin' || user.role === 'support' || user.role === 'analyst'
            );

            // Transform API data to match UI
            const transformedUsers = adminUsers.map(user => ({
                id: user.id,
                username: user.name || user.email.split('@')[0],
                email: user.email,
                role: user.role,
                status: user.is_email_verified ? 'active' : 'inactive',
                permissions: user.role === 'superadmin' ? ALL_PERMISSIONS :
                    user.role === 'admin' ? ['view_cafe_registry', 'view_subscriptions', 'view_pc_health'] : [],
                lastLogin: user.last_login || 'Never',
            }));
            setUsers(transformedUsers);
        } catch (err) {
            console.error('Failed to fetch users:', err);
            setError(err.response?.data?.detail || 'Failed to load users');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const filtered = useMemo(() => {
        if (!searchQuery) return users;
        const q = searchQuery.toLowerCase();
        return users.filter(u => u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }, [users, searchQuery]);

    const openCreateModal = () => { setEditingUser(null); setShowModal(true); };
    const openEditModal = (user) => { setEditingUser(user); setShowModal(true); };

    return (
        <div className="user-management">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Users & Roles</h1>
                    <p className="page-subtitle">Manage internal users and permissions</p>
                </div>
                {isSuperAdmin() && (
                    <button className="btn btn--primary" onClick={openCreateModal}><Plus size={16} /> Add User</button>
                )}
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="mini-stat glass-card"><Users size={20} /><span>{users.length}</span><span>Total Users</span></div>
                <div className="mini-stat glass-card"><Shield size={20} /><span>{users.filter(u => u.role === 'superadmin').length}</span><span>Super Admins</span></div>
                <div className="mini-stat glass-card"><Check size={20} /><span>{users.filter(u => u.status === 'active').length}</span><span>Active</span></div>
            </div>

            {/* Search */}
            <div className="search-bar">
                <Search size={16} className="search-bar__icon" />
                <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-bar__input" />
            </div>

            {/* Table */}
            <div className="card table-card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Permissions</th>
                            <th>Status</th>
                            <th>Last Login</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(user => (
                            <tr key={user.id}>
                                <td>
                                    <div className="user-cell">
                                        <div className="user-cell__avatar">{user.username.charAt(0).toUpperCase()}</div>
                                        <div className="user-cell__info">
                                            <span className="user-cell__name">{user.username}</span>
                                            <span className="user-cell__email">{user.email}</span>
                                        </div>
                                    </div>
                                </td>
                                <td><span className={`badge ${user.role === 'superadmin' ? 'badge--primary' : 'badge--neutral'}`}>{user.role}</span></td>
                                <td><span className="text-secondary">{user.permissions.length} permissions</span></td>
                                <td><span className={`badge badge--${user.status === 'active' ? 'success' : 'neutral'}`}>{user.status}</span></td>
                                <td className="text-secondary">{user.lastLogin}</td>
                                <td>
                                    <div className="row-actions">
                                        <button className="btn btn--icon btn--ghost" onClick={() => openEditModal(user)}><Edit size={16} /></button>
                                        {user.role !== 'superadmin' && <button className="btn btn--icon btn--ghost"><Trash2 size={16} /></button>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="modal modal--lg" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h2 className="modal__title">{editingUser ? 'Edit User' : 'Create User'}</h2>
                            <button className="modal__close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal__body">
                            <div className="form-grid">
                                <div className="input-group"><label className="input-label">Username</label><input type="text" className="input" defaultValue={editingUser?.username} /></div>
                                <div className="input-group"><label className="input-label">Email</label><input type="email" className="input" defaultValue={editingUser?.email} /></div>
                                <div className="input-group"><label className="input-label">Role</label>
                                    <select className="input select" defaultValue={editingUser?.role || 'admin'}>
                                        <option value="admin">Admin</option>
                                        <option value="support">Support</option>
                                        <option value="analyst">Analyst</option>
                                    </select>
                                </div>
                                <div className="input-group"><label className="input-label">Status</label>
                                    <select className="input select" defaultValue={editingUser?.status || 'active'}>
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div className="permissions-section">
                                <h4>Permissions</h4>
                                <div className="permission-groups">
                                    {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                                        <div key={group} className="permission-group">
                                            <span className="permission-group__title">{group}</span>
                                            <div className="permission-checks">
                                                {perms.map(perm => (
                                                    <label key={perm} className="permission-check">
                                                        <input type="checkbox" defaultChecked={editingUser?.permissions.includes(perm)} />
                                                        <span>{perm.replace(/_/g, ' ')}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn--primary">{editingUser ? 'Save Changes' : 'Create User'}</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .user-management { max-width: 1100px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: var(--space-6); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .stats-row { display: flex; gap: var(--space-4); margin-bottom: var(--space-6); }
        .mini-stat {
          display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4) var(--space-5);
        }
        .mini-stat svg { color: var(--text-tertiary); }
        .mini-stat span:nth-child(2) { font-size: var(--text-xl); font-weight: 600; }
        .mini-stat span:nth-child(3) { font-size: var(--text-sm); color: var(--text-tertiary); }

        .search-bar { position: relative; margin-bottom: var(--space-6); max-width: 320px; }
        .search-bar__icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); }
        .search-bar__input {
          width: 100%; padding: 12px 14px 12px 40px; font-size: var(--text-sm);
          background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--radius-md); color: var(--text-primary);
        }
        .search-bar__input::placeholder { color: var(--text-quaternary); }
        .search-bar__input:focus { outline: none; border-color: var(--accent-primary); box-shadow: var(--shadow-focus); }

        .table-card { padding: 0; overflow: hidden; }

        .user-cell { display: flex; align-items: center; gap: var(--space-3); }
        .user-cell__avatar {
          width: 36px; height: 36px; background: var(--accent-gradient); border-radius: var(--radius-md);
          display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: var(--text-sm); color: white;
        }
        .user-cell__name { display: block; font-weight: 500; }
        .user-cell__email { display: block; font-size: var(--text-xs); color: var(--text-tertiary); }

        .row-actions { display: flex; gap: var(--space-1); }

        .modal--lg { width: 600px; }
        .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); margin-bottom: var(--space-6); }

        .permissions-section h4 { font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-4); color: var(--text-secondary); }
        .permission-groups { display: flex; flex-direction: column; gap: var(--space-4); }
        .permission-group { padding: var(--space-4); background: rgba(0,0,0,0.2); border-radius: var(--radius-md); }
        .permission-group__title { display: block; font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: var(--space-3); }
        .permission-checks { display: flex; flex-wrap: wrap; gap: var(--space-3); }
        .permission-check { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); cursor: pointer; }
        .permission-check input { accent-color: var(--accent-primary); }
      `}</style>
        </div>
    );
}
