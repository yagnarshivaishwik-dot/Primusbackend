import React, { useState } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

const AddUserModal = ({ onClose, onSaved }) => {
    const [form, setForm] = useState({ username: '', email: '', password: '' });
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(s => ({ ...s, [k]: v }));
    const save = async () => {
        try {
            setBusy(true);
            const base = getApiBase().replace(/\/$/, '');
            const payload = { name: form.username, email: form.email, password: form.password, role: 'client', first_name: form.first_name || null, last_name: form.last_name || null, phone: form.phone || null };
            await axios.post(`${base}/api/user/create`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast('User created');
            onSaved && onSaved();
        } catch { showToast('Failed to create user'); } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between"><h3 className="text-white font-semibold">New user</h3><button onClick={onClose} className="text-gray-400 hover:text-white">✕</button></div>
                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Username</div>
                        <input className="search-input w-full rounded-md px-3 py-2" value={form.username} onChange={e => set('username', e.target.value)} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Password</div>
                        <input type="password" className="search-input w-full rounded-md px-3 py-2" value={form.password} onChange={e => set('password', e.target.value)} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Email</div>
                        <input className="search-input w-full rounded-md px-3 py-2" value={form.email} onChange={e => set('email', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><div className="text-xs text-gray-400 mb-1">First name</div><input className="search-input w-full rounded-md px-3 py-2" value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} /></div>
                        <div><div className="text-xs text-gray-400 mb-1">Last name</div><input className="search-input w-full rounded-md px-3 py-2" value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></div>
                    </div>
                    <div><div className="text-xs text-gray-400 mb-1">Phone number</div><input className="search-input w-full rounded-md px-3 py-2" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
                </div>
                <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
                    <button className="pill" onClick={onClose}>Cancel</button>
                    <button className="btn-primary-neo px-4 py-2 rounded-md" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

AddUserModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    onSaved: PropTypes.func
};

export default AddUserModal;
