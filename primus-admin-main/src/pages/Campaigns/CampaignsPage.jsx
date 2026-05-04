import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

// ── Campaigns (Bugzilla #3) ───────────────────────────────────────
// Admin CRUD over /api/campaign/. Backend CampaignIn schema:
// { name, type, content, image_url, discount_percent, target_audience,
//   start_date, end_date, active }. <input type="datetime-local"> values
// are converted to ISO via new Date(...).toISOString() before POSTing.
const CampaignsPage = ({ cafeInfo }) => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editCampaign, setEditCampaign] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        type: 'discount',
        content: '',
        image_url: '',
        discount_percent: '',
        target_audience: 'all',
        start_date: '',
        end_date: '',
        active: true,
    });

    const fetchCampaigns = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const res = await axios.get(`${base}/api/campaign/`, { headers: authHeaders() });
            setCampaigns(res.data || []);
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to load campaigns');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    const openCreate = () => {
        setEditCampaign(null);
        setForm({
            name: '',
            type: 'discount',
            content: '',
            image_url: '',
            discount_percent: '',
            target_audience: 'all',
            start_date: '',
            end_date: '',
            active: true,
        });
        setShowModal(true);
    };

    const openEdit = (c) => {
        setEditCampaign(c);
        const toLocalInput = (iso) =>
            iso ? new Date(iso).toISOString().slice(0, 16) : '';
        setForm({
            name: c.name || '',
            type: c.type || 'discount',
            content: c.content || '',
            image_url: c.image_url || '',
            discount_percent: String(c.discount_percent ?? ''),
            target_audience: c.target_audience || 'all',
            start_date: toLocalInput(c.start_date),
            end_date: toLocalInput(c.end_date),
            active: c.active ?? true,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            showToast('Name is required');
            return;
        }
        if (form.start_date && form.end_date &&
            new Date(form.end_date) < new Date(form.start_date)) {
            showToast('End date must be after start date');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, '');
            const payload = {
                name: form.name.trim(),
                type: form.type,
                content: form.content.trim() || null,
                image_url: form.image_url.trim() || null,
                discount_percent: parseFloat(form.discount_percent || '0'),
                target_audience: form.target_audience,
                // Always send ISO 8601; backend rejects naive strings.
                start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
                end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
                active: form.active,
            };
            if (editCampaign) {
                await axios.put(`${base}/api/campaign/${editCampaign.id}`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast('Campaign updated');
            } else {
                await axios.post(`${base}/api/campaign/`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast('Campaign created');
            }
            setShowModal(false);
            fetchCampaigns();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save campaign');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (c) => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.patch(`${base}/api/campaign/${c.id}/toggle`, null, {
                headers: authHeaders(),
            });
            fetchCampaigns();
        } catch (e) {
            showToast('Failed to toggle');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this campaign?')) return;
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.delete(`${base}/api/campaign/${id}`, { headers: authHeaders() });
            showToast('Campaign deleted');
            fetchCampaigns();
        } catch {
            showToast('Failed to delete');
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Campaigns</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">
                            Campaigns for: <span className="font-semibold">{cafeName}</span>
                        </p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ New Campaign</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {loading && [1, 2].map(i => <div key={i} className="card-animated h-48 skeleton-shimmer" />)}
                {!loading && campaigns.length === 0 && (
                    <div className="card-animated p-6 text-gray-400 col-span-full">
                        No campaigns yet. Click &quot;+ New Campaign&quot; to launch one.
                    </div>
                )}
                {!loading && campaigns.map(c => (
                    <div key={c.id} className="card-animated p-6">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-white">{c.name}</h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    {c.type} · {c.target_audience}
                                </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                {c.active ? 'Active' : 'Paused'}
                            </span>
                        </div>
                        {c.discount_percent > 0 && (
                            <p className="text-2xl font-bold text-indigo-400 mb-2">{c.discount_percent}% off</p>
                        )}
                        {c.content && <p className="text-sm text-gray-300 mt-2">{c.content}</p>}
                        <div className="text-xs text-gray-500 mt-3 space-y-0.5">
                            {c.start_date && <p>Starts: {new Date(c.start_date).toLocaleString()}</p>}
                            {c.end_date && <p>Ends: {new Date(c.end_date).toLocaleString()}</p>}
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => openEdit(c)} className="flex-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Edit</button>
                            <button onClick={() => handleToggle(c)} className="px-3 py-2 text-sm rounded-md bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 transition-colors">
                                {c.active ? 'Pause' : 'Resume'}
                            </button>
                            <button onClick={() => handleDelete(c.id)} className="px-3 py-2 text-sm rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors">Delete</button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg rounded-xl max-h-[90vh] overflow-y-auto"
                        style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1a1d21] z-10">
                            <h3 className="text-white font-semibold">
                                {editCampaign ? 'Edit Campaign' : 'New Campaign'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Name *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Friday Night LAN" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Type</label>
                                    <select className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.type}
                                        onChange={e => setForm({ ...form, type: e.target.value })}>
                                        <option value="discount">Discount</option>
                                        <option value="announcement">Announcement</option>
                                        <option value="promotion">Promotion</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Audience</label>
                                    <select className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.target_audience}
                                        onChange={e => setForm({ ...form, target_audience: e.target.value })}>
                                        <option value="all">Everyone</option>
                                        <option value="members">Members only</option>
                                        <option value="guests">Guests only</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Description / Body</label>
                                <textarea rows="3"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    placeholder="Half-price hourly packs all night long" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Discount %</label>
                                    <input type="number" min="0" max="100" step="0.1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.discount_percent}
                                        onChange={e => setForm({ ...form, discount_percent: e.target.value })}
                                        placeholder="0" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Image URL</label>
                                    <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.image_url}
                                        onChange={e => setForm({ ...form, image_url: e.target.value })}
                                        placeholder="https://…" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Starts</label>
                                    <input type="datetime-local"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.start_date}
                                        onChange={e => setForm({ ...form, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Ends</label>
                                    <input type="datetime-local"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.end_date}
                                        onChange={e => setForm({ ...form, end_date: e.target.value })} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={form.active}
                                    onChange={e => setForm({ ...form, active: e.target.checked })} />
                                Active
                            </label>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2 sticky bottom-0 bg-[#1a1d21]">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : (editCampaign ? 'Save Changes' : 'Create Campaign')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

CampaignsPage.propTypes = {
    cafeInfo: PropTypes.object,
};

export default CampaignsPage;
