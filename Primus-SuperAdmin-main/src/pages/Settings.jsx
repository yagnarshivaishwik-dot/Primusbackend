import { useState } from 'react';
import { User, Shield, Bell, Settings as SettingsIcon, Mail, Save, Loader2, Check, ChevronRight, AlertCircle, X } from 'lucide-react';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

const TABS = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'system', label: 'System', icon: SettingsIcon },
];

export default function Settings() {
    const { user, isSuperAdmin, changePassword } = useAuthStore();
    const [activeTab, setActiveTab] = useState('profile');
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            // For system settings, use settings API
            if (activeTab === 'system' && isSuperAdmin()) {
                await api.put('/settings/', {
                    trial_duration: document.querySelector('[name="trial_duration"]')?.value,
                    grace_period: document.querySelector('[name="grace_period"]')?.value,
                    system_email: document.querySelector('[name="system_email"]')?.value,
                });
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (passwordForm.new !== passwordForm.confirm) {
            setError('New passwords do not match');
            return;
        }
        setIsSaving(true);
        setError(null);
        try {
            const result = await changePassword(passwordForm.current, passwordForm.new);
            if (result.success) {
                setShowPasswordModal(false);
                setPasswordForm({ current: '', new: '', confirm: '' });
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } else {
                setError(result.error || 'Failed to change password');
            }
        } catch (err) {
            setError(err.message || 'Failed to change password');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="settings">
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
                <p className="page-subtitle">Manage your account and system preferences</p>
            </div>

            <div className="settings-layout">
                {/* Sidebar */}
                <nav className="settings-nav glass-card">
                    {TABS.map(tab => {
                        if (tab.id === 'system' && !isSuperAdmin()) return null;
                        const Icon = tab.icon;
                        return (
                            <button key={tab.id} className={`settings-nav__item ${activeTab === tab.id ? 'settings-nav__item--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                <Icon size={18} />
                                <span>{tab.label}</span>
                                <ChevronRight size={16} className="settings-nav__chevron" />
                            </button>
                        );
                    })}
                </nav>

                {/* Content */}
                <div className="settings-content glass-card">
                    {activeTab === 'profile' && (
                        <div className="settings-section">
                            <h2 className="settings-section__title">Profile Information</h2>
                            <p className="settings-section__desc">Update your account details</p>
                            <div className="form-grid">
                                <div className="input-group">
                                    <label className="input-label">Username</label>
                                    <input type="text" className="input" defaultValue={user?.username} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email</label>
                                    <input type="email" className="input" defaultValue={user?.email} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Display Name</label>
                                    <input type="text" className="input" defaultValue={user?.username} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Role</label>
                                    <input type="text" className="input" value={user?.role === 'superadmin' ? 'Super Admin' : user?.role} disabled />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="settings-section">
                            <h2 className="settings-section__title">Security</h2>
                            <p className="settings-section__desc">Manage your password and security settings</p>
                            <div className="security-options">
                                <div className="security-item">
                                    <div className="security-item__info">
                                        <h4>Change Password</h4>
                                        <p>Update your password regularly for security</p>
                                    </div>
                                    <button className="btn btn--secondary btn--sm" onClick={() => setShowPasswordModal(true)}>Change</button>
                                </div>
                                <div className="security-item">
                                    <div className="security-item__info">
                                        <h4>Two-Factor Authentication</h4>
                                        <p>Add an extra layer of security</p>
                                    </div>
                                    <button className="btn btn--secondary btn--sm">Enable</button>
                                </div>
                                <div className="security-item">
                                    <div className="security-item__info">
                                        <h4>Active Sessions</h4>
                                        <p>Manage devices logged into your account</p>
                                    </div>
                                    <button className="btn btn--ghost btn--sm">View</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="settings-section">
                            <h2 className="settings-section__title">Notifications</h2>
                            <p className="settings-section__desc">Configure how you receive alerts</p>
                            <div className="notification-options">
                                {['Payment alerts', 'New café registrations', 'System health warnings', 'Weekly reports'].map((item, i) => (
                                    <label key={i} className="toggle-item">
                                        <div className="toggle-item__info">
                                            <span className="toggle-item__label">{item}</span>
                                        </div>
                                        <input type="checkbox" className="toggle" defaultChecked={i < 2} />
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'system' && isSuperAdmin() && (
                        <div className="settings-section">
                            <h2 className="settings-section__title">System Configuration</h2>
                            <p className="settings-section__desc">Global system settings (Super Admin only)</p>
                            <div className="form-grid">
                                <div className="input-group">
                                    <label className="input-label">Trial Duration (days)</label>
                                    <input type="number" name="trial_duration" className="input" defaultValue={14} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Grace Period (days)</label>
                                    <input type="number" name="grace_period" className="input" defaultValue={7} />
                                </div>
                                <div className="input-group full-width">
                                    <label className="input-label">System Email</label>
                                    <input type="email" name="system_email" className="input" defaultValue="system@primus.io" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Save Button */}
                    <div className="settings-actions">
                        <button className="btn btn--primary" onClick={handleSave} disabled={isSaving}>
                            {saved ? <><Check size={16} /> Saved</> : isSaving ? <><Loader2 size={16} className="spin" /> Saving...</> : <><Save size={16} /> Save Changes</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Password Change Modal */}
            {showPasswordModal && (
                <div className="modal-backdrop" onClick={() => setShowPasswordModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal__header">
                            <h3 className="modal__title">Change Password</h3>
                            <button className="modal__close" onClick={() => setShowPasswordModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal__body">
                            {error && (
                                <div className="alert alert--error" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--status-danger-subtle)', color: 'var(--status-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                                    {error}
                                </div>
                            )}
                            <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="input-label">Current Password</label>
                                <input
                                    type="password"
                                    className="input"
                                    placeholder="Enter current password"
                                    value={passwordForm.current}
                                    onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                />
                            </div>
                            <div className="input-group" style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="input-label">New Password</label>
                                <input
                                    type="password"
                                    className="input"
                                    placeholder="Enter new password (min 8 characters)"
                                    value={passwordForm.new}
                                    onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Confirm New Password</label>
                                <input
                                    type="password"
                                    className="input"
                                    placeholder="Confirm new password"
                                    value={passwordForm.confirm}
                                    onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal__footer">
                            <button className="btn btn--secondary" onClick={() => setShowPasswordModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn--primary" onClick={handleChangePassword} disabled={isSaving}>
                                {isSaving ? <><Loader2 size={16} className="spin" /> Changing...</> : 'Change Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .settings { max-width: 1000px; }
        .page-header { margin-bottom: var(--space-8); }
        .page-title { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); letter-spacing: -0.02em; }
        .page-subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .settings-layout { display: grid; grid-template-columns: 240px 1fr; gap: var(--space-6); }

        .settings-nav { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
        .settings-nav__item {
          display: flex; align-items: center; gap: var(--space-3);
          padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
          background: transparent; border: none; color: var(--text-secondary);
          font-size: var(--text-sm); cursor: pointer; text-align: left;
          transition: all var(--duration-fast) var(--ease-out);
        }
        .settings-nav__item:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
        .settings-nav__item--active { background: var(--accent-primary-subtle); color: var(--accent-primary); }
        .settings-nav__chevron { margin-left: auto; opacity: 0; transition: opacity var(--duration-fast); }
        .settings-nav__item:hover .settings-nav__chevron, .settings-nav__item--active .settings-nav__chevron { opacity: 1; }

        .settings-content { padding: var(--space-8); }
        .settings-section__title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-2); }
        .settings-section__desc { font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-6); }

        .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-5); }
        .full-width { grid-column: 1 / -1; }

        .security-options, .notification-options { display: flex; flex-direction: column; gap: var(--space-4); }
        .security-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--space-4); background: rgba(0,0,0,0.2); border-radius: var(--radius-md);
        }
        .security-item__info h4 { font-size: var(--text-sm); font-weight: 500; margin-bottom: var(--space-1); }
        .security-item__info p { font-size: var(--text-xs); color: var(--text-tertiary); }

        .toggle-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--space-4); background: rgba(0,0,0,0.2); border-radius: var(--radius-md); cursor: pointer;
        }
        .toggle-item__label { font-size: var(--text-sm); }
        .toggle {
          width: 44px; height: 24px; appearance: none; background: var(--bg-surface);
          border-radius: 12px; position: relative; cursor: pointer; transition: background var(--duration-fast);
        }
        .toggle::before {
          content: ''; position: absolute; top: 2px; left: 2px;
          width: 20px; height: 20px; background: white; border-radius: 50%;
          transition: transform var(--duration-fast);
        }
        .toggle:checked { background: var(--accent-primary); }
        .toggle:checked::before { transform: translateX(20px); }

        .settings-actions { margin-top: var(--space-8); padding-top: var(--space-6); border-top: 1px solid var(--divider); display: flex; justify-content: flex-end; }

        @media (max-width: 768px) { .settings-layout { grid-template-columns: 1fr; } .form-grid { grid-template-columns: 1fr; } }
      `}</style>
        </div>
    );
}
