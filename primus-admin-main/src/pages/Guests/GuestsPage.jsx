import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders } from '../../utils/api';

const GuestsPage = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchGuests = useCallback(async () => { try { setLoading(true); const r = await axios.get(`${getApiBase().replace(/\/$/, '')}/api/session/guests`, { headers: authHeaders() }); setRows(r.data || []); } catch { setRows([]); } finally { setLoading(false); } }, []);
    useEffect(() => { fetchGuests(); const t = setInterval(fetchGuests, 15000); return () => clearInterval(t); }, [fetchGuests]);
    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Guests</h1>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">SESSION NAME</th>
                            <th className="p-3">DEVICE NAME</th>
                            <th className="p-3">STATUS</th>
                            <th className="p-3">SESSION TYPE</th>
                            <th className="p-3">TIME PLAYED</th>
                            <th className="p-3">STARTED AT</th>
                            <th className="p-3">ENDED AT</th>
                            <th className="p-3">LOGGED IN BY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={8}>Loading...</td></tr>)}
                        {!loading && rows.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={8}>No records available.</td></tr>)}
                        {!loading && rows.map(s => (
                            <tr key={s.id} className="border-t border-white/10">
                                <td className="p-3">Session #{s.id}</td>
                                <td className="p-3">PC-{s.pc_id}</td>
                                <td className="p-3">active</td>
                                <td className="p-3">Guest</td>
                                <td className="p-3">{s.start_time ? `${Math.floor((Date.now() - new Date(s.start_time).getTime()) / 60000)}m` : '-'}</td>
                                <td className="p-3">{s.start_time || '-'}</td>
                                <td className="p-3">{s.end_time || '-'}</td>
                                <td className="p-3">{s.user_id || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default GuestsPage;
