import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders } from '../../utils/api';

const OrdersPage = () => {
    const [active, setActive] = useState('All orders');
    const tabs = ['All orders', 'Transactions', 'Awaiting payment', 'Awaiting delivery', 'Post-Pay (locked)'];
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchOrders = useCallback(async () => {
        try { setLoading(true); const r = await axios.get(`${getApiBase().replace(/\/$/, '')}/api/payment/order`, { headers: authHeaders() }); setOrders(r.data || []); } catch { setOrders([]); } finally { setLoading(false); }
    }, []);
    useEffect(() => { fetchOrders(); }, [fetchOrders]);
    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Orders</h1>
            <div className="flex items-center gap-2 mb-3">
                {tabs.map(t => (<button key={t} onClick={() => setActive(t)} className={`pill ${active === t ? 'pill-active' : ''}`}>{t}{t.includes('Awaiting') || t.includes('Post-Pay') ? <span className="ml-2 text-xs opacity-80">0</span> : null}</button>))}
            </div>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">DATE/TIME</th>
                            <th className="p-3">STATUS</th>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">ACTION</th>
                            <th className="p-3">DETAILS</th>
                            <th className="p-3">AMOUNT</th>
                            <th className="p-3">SOURCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={7}>Loading...</td></tr>)}
                        {!loading && orders.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={7}>No records available.</td></tr>)}
                        {!loading && orders.map(o => (
                            <tr key={o.id} className="border-t border-white/10">
                                <td className="p-3">{o.datetime || '-'}</td>
                                <td className="p-3">{o.status}</td>
                                <td className="p-3">{o.username || '-'}</td>
                                <td className="p-3">{o.action}</td>
                                <td className="p-3">{o.details}</td>
                                <td className="p-3">₹ {Number(o.amount || 0).toFixed(2)}</td>
                                <td className="p-3">{o.source}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default OrdersPage;
