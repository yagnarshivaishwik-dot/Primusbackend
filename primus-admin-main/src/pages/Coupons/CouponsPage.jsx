import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

// ── Coupons (Bugzilla #1) ─────────────────────────────────────────
// Admin CRUD over POST /api/coupon/ + GET /api/coupon/. Backend
// CouponIn schema: { code, discount_percent, max_uses, per_user_limit,
// expires_at, applies_to }. cafe_id is injected from JWT, never sent.
const CouponsPage = ({ cafeInfo }) => {
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        code: '',
        discount_percent: '',
        max_uses: '',
        per_user_limit: '',
        expires_at: '',
        applies_to: '*',
    });

    const fetchCoupons = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const res = await axios.get(`${base}/api/coupon/`, { headers: authHeaders() });
            setCoupons(res.data || []);
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to load coupons');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

    const openCreate = () => {
        setForm({
            code: '',
            discount_percent: '',
            max_uses: '',
            per_user_limit: '',
            expires_at: '',
            applies_to: '*',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        const code = form.code.trim().toUpperCase();
        if (!code) {
            showToast('Coupon code is required');
            return;
        }
        const discount = parseFloat(form.discount_percent || '0');
        if (Number.isNaN(discount) || discount < 0 || discount > 100) {
            showToast('Discount must be between 0 and 100');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, '');
            const payload = {
                code,
                discount_percent: discount,
                max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
                per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit, 10) : null,
                // <input type="datetime-local"> gives us "YYYY-MM-DDTHH:mm";
                // backend's CouponIn expects an ISO datetime so append :00 if needed.
                expires_at: form.expires_at
                    ? new Date(form.expires_at).toISOString()
                    : null,
                applies_to: form.applies_to.trim() || '*',
            };
            await axios.post(`${base}/api/coupon/`, payload, {
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            });
            showToast(`Coupon "${code}" created`);
            setShowModal(false);
            fetchCoupons();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save coupon');
        } finally {
            setSaving(false);
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Coupons</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">
                            Coupons for: <span className="font-semibold">{cafeName}</span>
                        </p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ New Coupon</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {loading && [1, 2, 3].map(i => <div key={i} className="card-animated h-40 skeleton-shimmer" />)}
                {!loading && coupons.length === 0 && (
                    <div className="card-animated p-6 text-gray-400 col-span-full">
                        No coupons yet. Click &quot;+ New Coupon&quot; to create one.
                    </div>
                )}
                {!loading && coupons.map(c => {
                    const expired = c.expires_at && new Date(c.expires_at) < new Date();
                    const exhausted = c.max_uses && c.times_used >= c.max_uses;
                    const status = expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active';
                    const statusClass = expired || exhausted
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-green-500/20 text-green-400';
                    return (
                        <div key={c.id} className="card-animated p-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-bold text-white font-mono tracking-wider">{c.code}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>{status}</span>
                            </div>
                            <p className="text-3xl font-bold text-indigo-400 mb-1">{c.discount_percent}% off</p>
                            <p className="text-xs text-gray-400 mt-2">
                                Used {c.times_used}{c.max_uses ? ` / ${c.max_uses}` : ''}
                                {c.per_user_limit ? ` · ${c.per_user_limit}/user` : ''}
                            </p>
                            {c.expires_at && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Expires {new Date(c.expires_at).toLocaleString()}
                                </p>
                            )}
                            {c.applies_to && c.applies_to !== '*' && (
                                <p className="text-xs text-gray-500 mt-1">Applies to: {c.applies_to}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">New Coupon</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Code *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white font-mono uppercase"
                                    value={form.code}
                                    onChange={e => setForm({ ...form, code: e.target.value })}
                                    placeholder="WELCOME10" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Discount % *</label>
                                    <input type="number" min="0" max="100" step="0.1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.discount_percent}
                                        onChange={e => setForm({ ...form, discount_percent: e.target.value })}
                                        placeholder="10" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Applies to</label>
                                    <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.applies_to}
                                        onChange={e => setForm({ ...form, applies_to: e.target.value })}
                                        placeholder="* (everything)" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Max uses</label>
                                    <input type="number" min="1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.max_uses}
                                        onChange={e => setForm({ ...form, max_uses: e.target.value })}
                                        placeholder="100" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Per-user limit</label>
                                    <input type="number" min="1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.per_user_limit}
                                        onChange={e => setForm({ ...form, per_user_limit: e.target.value })}
                                        placeholder="1" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Expires (optional)</label>
                                <input type="datetime-local"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.expires_at}
                                    onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                            </div>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : 'Create Coupon'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

CouponsPage.propTypes = {
    cafeInfo: PropTypes.object,
};

export default CouponsPage;
