import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

const BookingsPage = () => {
    const [date, setDate] = useState(() => new Date());
    const [showCal, setShowCal] = useState(false);
    const [pcs, setPcs] = useState([]);
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const nextDay = () => setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
    const prevDay = () => setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
    const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const fetchPcs = useCallback(async () => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            let list = [];
            try { const r = await axios.get(`${base}/api/clientpc/`, { headers: authHeaders() }); list = (r.data || []).map(p => ({ id: p.id, name: p.name })); }
            catch { const r2 = await axios.get(`${base}/api/pc/`, { headers: authHeaders() }); list = (r2.data || []).map(p => ({ id: p.id, name: p.name })); }
            setPcs(list);
        } catch { }
    }, []);
    useEffect(() => { fetchPcs(); }, [fetchPcs]);

    // Calendar model: one year forward only, no past dates
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const oneYear = new Date(); oneYear.setFullYear(oneYear.getFullYear() + 1);
    const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const buildCalendar = () => {
        const y = date.getFullYear(); const m = date.getMonth();
        const first = new Date(y, m, 1); const startIndex = (first.getDay() + 6) % 7; // start Monday-like
        const total = daysInMonth(y, m);
        const days = [];
        for (let i = 0; i < startIndex; i++) days.push(null);
        for (let d = 1; d <= total; d++) days.push(new Date(y, m, d));
        return days;
    };

    const hours = Array.from({ length: 24 }, (_, i) => (i === 0 ? '12:00 am' : i < 12 ? `${i}:00 am` : i === 12 ? '12:00 pm' : `${i - 12}:00 pm`));
    const createBooking = async (pcId, hourIndex) => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            const start = new Date(date); start.setHours(hourIndex, 0, 0, 0);
            const end = new Date(start); end.setHours(start.getHours() + 1);
            const payload = { pc_id: pcId, start_time: start.toISOString(), end_time: end.toISOString() };
            await axios.post(`${base}/api/booking/`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast('Booking created');
        } catch { showToast('Failed to create booking'); }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Bookings</h1>
            <div className="flex items-center justify-center mb-4 gap-2">
                <button className="pill" onClick={prevDay}>‹</button>
                <button className="pill" onClick={() => setShowCal(s => !s)}>{fmt(date)}</button>
                <button className="pill" onClick={nextDay}>›</button>
            </div>
            {showCal && (
                <div className="calendar-pop mx-auto mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{date.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                        <div className="flex gap-2">
                            <button className="pill" onClick={() => setDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n < today ? today : n; })}>‹</button>
                            <button className="pill" onClick={() => setDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n > oneYear ? oneYear : n; })}>›</button>
                        </div>
                    </div>
                    <div className="calendar-grid text-xs mb-1">
                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(k => <div key={k} className="text-center text-gray-400 py-1">{k}</div>)}
                    </div>
                    <div className="calendar-grid">
                        {buildCalendar().map((d, i) => d ? (
                            <button key={i} className={`calendar-day ${+d === +startOfDay(date) ? 'active' : ''} ${d < today || d > oneYear ? 'disabled' : ''}`} onClick={() => { if (d >= today && d <= oneYear) { setDate(d); setShowCal(false); } }}>{d.getDate()}</button>
                        ) : <div key={i} />)}
                    </div>
                </div>
            )}
            {/* Header timeline */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {hours.map((h, i) => (<div key={i} className="min-w-[120px] text-center text-gray-300 bg-white/5 rounded-md py-2">{h}</div>))}
            </div>
            {/* Rows per PC */}
            <div className="space-y-2">
                {pcs.map(pc => (
                    <div key={pc.id} className="flex items-center gap-2">
                        <div className="w-40 text-gray-300">{pc.name}</div>
                        <div className="flex-1 overflow-x-auto">
                            <div className="flex gap-2">
                                {hours.map((_, i) => (<button key={i} onClick={() => createBooking(pc.id, i)} className="min-w-[120px] h-8 bg-white/3 rounded-md relative hover:bg-white/6" />))}
                            </div>
                        </div>
                    </div>
                ))}
                {pcs.length === 0 && <div className="text-gray-500">No systems registered.</div>}
            </div>
        </div>
    );
};

export default BookingsPage;
