import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';
import AddUserModal from './AddUserModal.jsx';
import ImportUsersModal from './ImportUsersModal.jsx';

const UsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [showAddTime, setShowAddTime] = useState(null); // user object or null
    const [hoursToAdd, setHoursToAdd] = useState('1');

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const r = await axios.get(`${base}/api/user/`, { headers: authHeaders() });
            setUsers(r.data || []);
        } catch {
            showToast('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const exportUsers = async () => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            const res = await fetch(`${base}/api/user/export`, { headers: authHeaders() });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'users.csv'; a.click();
            URL.revokeObjectURL(url);
        } catch {
            showToast('Export failed');
        }
    };

    const onImported = async (result) => {
        showToast(`Imported ${result?.created || 0} users`);
        setShowImport(false);
        fetchUsers();
    };

    const handleAddTime = async () => {
        if (!showAddTime) return;
        const hours = parseFloat(hoursToAdd);
        if (isNaN(hours) || hours <= 0) {
            showToast('Please enter a valid number of hours');
            return;
        }
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.post(`${base}/api/offer/admin/add-time/${showAddTime.id}?hours=${hours}`, null, { headers: authHeaders() });
            showToast(`Added ${hours} hour(s) to ${showAddTime.username || showAddTime.email}`);
            setShowAddTime(null);
            setHoursToAdd('1');
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to add time');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-bold text-white">Users</h1>
                <div className="flex items-center gap-2">
                    <button className="pill" onClick={exportUsers}>Export users</button>
                    <button className="btn-primary-neo px-3 py-1.5 rounded-md" onClick={() => setShowAdd(true)}>Add user</button>
                    <button className="pill" onClick={() => setShowImport(true)}>Import users</button>
                    <button className="pill">User group</button>
                </div>
            </div>
            <div className="card-animated overflow-visible" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase sticky top-0" style={{ background: '#1a1d21' }}>
                        <tr>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">EMAIL</th>
                            <th className="p-3">ACCOUNT BALANCE</th>
                            <th className="p-3">COINS BALANCE</th>
                            <th className="p-3">TIME LEFT (Hours)</th>
                            <th className="p-3">USER GROUP</th>
                            <th className="p-3 text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td className="p-6 text-gray-500" colSpan={7}>Loading...</td></tr>
                        )}
                        {!loading && users.length === 0 && (
                            <tr><td className="p-6 text-gray-500" colSpan={7}>No records available.</td></tr>
                        )}
                        {!loading && users.map((u, index) => (
                            <tr key={u.id} className="border-t border-white/10">
                                <td className="p-3 text-white">{u.username || u.name}</td>
                                <td className="p-3">{u.email}</td>
                                <td className="p-3">₹ {Number(u.wallet_balance || u.account_balance || 0).toFixed(2)}</td>
                                <td className="p-3">{u.coins_balance || 0}</td>
                                <td className="p-3">{u.time_remaining_hours != null ? u.time_remaining_hours.toFixed(1) : '-'}</td>
                                <td className="p-3">{u.user_group || '-'}</td>
                                <td className="p-3 text-right relative">
                                    <button
                                        className="text-gray-400 hover:text-white px-2 py-1"
                                        onClick={() => setMenuOpenId(menuOpenId === u.id ? null : u.id)}
                                    >
                                        ⋮
                                    </button>
                                    {menuOpenId === u.id && (
                                        <div
                                            className="absolute right-0 z-50 w-40 rounded-lg shadow-2xl"
                                            style={{
                                                background: '#1a1d21',
                                                border: '1px solid #2a2d31',
                                                bottom: index >= users.length - 2 ? '100%' : 'auto',
                                                top: index >= users.length - 2 ? 'auto' : '100%'
                                            }}
                                        >
                                            <button
                                                className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-white"
                                                onClick={() => { setShowAddTime(u); setMenuOpenId(null); }}
                                            >
                                                ⏱️ Add Time
                                            </button>
                                            <button
                                                className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-white"
                                                onClick={() => { setMenuOpenId(null); showToast('Edit user coming soon'); }}
                                            >
                                                ✏️ Edit User
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchUsers(); }} />}
            {showImport && <ImportUsersModal onClose={() => setShowImport(false)} onImported={onImported} />}

            {/* Add Time Modal */}
            {showAddTime && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">Add Time to User</h3>
                            <button onClick={() => setShowAddTime(null)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-gray-300">
                                Adding time to: <span className="text-white font-semibold">{showAddTime.username || showAddTime.name || showAddTime.email}</span>
                            </p>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Hours to Add</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={hoursToAdd}
                                    onChange={(e) => setHoursToAdd(e.target.value)}
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                    placeholder="1"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowAddTime(null)} className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600">Cancel</button>
                                <button onClick={handleAddTime} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500">Add Time</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersPage;
