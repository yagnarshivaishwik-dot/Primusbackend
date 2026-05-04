import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders } from '../../utils/api';

const ActivityPage = () => {
    const [filters, setFilters] = useState({ start: '', end: '', category: '', pc: '', employee: '', user: '' });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const set = (k, v) => setFilters(s => ({ ...s, [k]: v }));
    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const url = new URL(`${base}/api/audit/`);
            Object.entries(filters).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
            const r = await axios.get(url.toString(), { headers: authHeaders() });
            setLogs(r.data || []);
        } catch { setLogs([]); } finally { setLoading(false); }
    }, [filters]);
    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const exportCsv = () => {
        const header = ['datetime', 'username', 'action', 'details', 'amount', 'coins', 'pc', 'source'];
        const rows = logs.map(l => [l.timestamp || '', l.user_id || '', l.action || '', l.detail || '', '', '', '', l.ip || '']);
        const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replaceAll('"', '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'activity.csv'; a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Activity tracker</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Start date</div><input type="datetime-local" className="search-input w-full rounded-md px-2 py-1" value={filters.start} onChange={e => set('start', e.target.value)} /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">End date</div><input type="datetime-local" className="search-input w-full rounded-md px-2 py-1" value={filters.end} onChange={e => set('end', e.target.value)} /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Category</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Order" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">PC</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.pc} onChange={e => set('pc', e.target.value)} placeholder="id or name" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Employee</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.employee} onChange={e => set('employee', e.target.value)} placeholder="name or id" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">User</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.user} onChange={e => set('user', e.target.value)} placeholder="name or id" /></div>
            </div>
            <div className="flex items-center gap-2 mb-3">
                <button className="pill" onClick={fetchLogs}>Apply</button>
                <button className="pill" onClick={() => { setFilters({ start: '', end: '', category: '', pc: '', employee: '', user: '' }); }}>Reset</button>
                <button className="btn-primary-neo px-3 py-1.5 rounded-md" onClick={exportCsv}>Export CSV</button>
            </div>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">DAY / TIME</th>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">ACTION</th>
                            <th className="p-3">DETAILS</th>
                            <th className="p-3">AMOUNT</th>
                            <th className="p-3">COINS</th>
                            <th className="p-3">PC</th>
                            <th className="p-3">SOURCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={8}>Loading...</td></tr>)}
                        {!loading && logs.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={8}>No records available.</td></tr>)}
                        {!loading && logs.map((l, i) => (
                            <tr key={i} className="border-t border-white/10">
                                <td className="p-3">{l.timestamp}</td>
                                <td className="p-3">{l.user_id || '-'}</td>
                                <td className="p-3">{l.action}</td>
                                <td className="p-3">{l.detail}</td>
                                <td className="p-3">-</td>
                                <td className="p-3">-</td>
                                <td className="p-3">-</td>
                                <td className="p-3">{l.ip || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ActivityPage;
