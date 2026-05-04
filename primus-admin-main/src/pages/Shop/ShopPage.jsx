import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

const ShopPage = ({ cafeInfo }) => {
    const [activeTab, setActiveTab] = useState('TimePacks');
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editOffer, setEditOffer] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', hours: '', price: '', description: '', active: true });

    const tabs = ['TimePacks', 'Products', 'Prizes'];

    const fetchOffers = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const res = await axios.get(`${base}/api/shop/packs`, { headers: authHeaders() });
            setOffers(res.data || []);
        } catch (e) {
            showToast('Failed to load time packs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOffers(); }, [fetchOffers]);

    const openCreate = () => {
        setEditOffer(null);
        setForm({ name: '', hours: '', price: '', description: '', active: true });
        setShowModal(true);
    };

    const openEdit = (offer) => {
        setEditOffer(offer);
        setForm({
            name: offer.name,
            hours: String((offer.minutes / 60).toFixed(1)),
            price: String(offer.price),
            description: offer.description || '',
            active: offer.active ?? true,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.hours || !form.price) {
            showToast('Name, hours and price are required');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, '');
            // cafe_id is NOT sent — backend injects it from JWT
            const payload = {
                name: form.name.trim(),
                hours: parseFloat(form.hours),
                price: parseFloat(form.price),
                description: form.description.trim() || null,
                active: form.active,
            };
            if (editOffer) {
                await axios.put(`${base}/api/shop/offers/${editOffer.id}`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
                showToast('Package updated');
            } else {
                await axios.post(`${base}/api/shop/offers`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
                showToast('Package created');
            }
            setShowModal(false);
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save package');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this package? It will be hidden from customers.')) return;
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.delete(`${base}/api/shop/offers/${id}`, { headers: authHeaders() });
            showToast('Package removed');
            fetchOffers();
        } catch {
            showToast('Failed to delete');
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Shop Management</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">Packages for: <span className="font-semibold">{cafeName}</span></p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ Add Time Package</button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-3 mb-6 mt-4">
                {tabs.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`pill ${activeTab === t ? 'pill-active' : ''}`}>{t}</button>
                ))}
            </div>

            {activeTab === 'TimePacks' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {loading && [1, 2, 3, 4].map(i => <div key={i} className="card-animated h-48 skeleton-shimmer" />)}
                    {!loading && offers.length === 0 && (
                        <div className="card-animated p-6 text-gray-400 col-span-full">
                            No time packages found. Click &quot;+ Add Time Package&quot; to create one.
                        </div>
                    )}
                    {!loading && offers.map(offer => (
                        <div key={offer.id} className="card-animated p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-bold text-white">{offer.name}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${offer.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {offer.active ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                                <p className="text-3xl font-bold text-indigo-400 mb-1">₹{Number(offer.price).toFixed(2)}</p>
                                <p className="text-sm text-gray-400">{offer.minutes} min ({(offer.minutes / 60).toFixed(1)} hrs)</p>
                                {offer.description && <p className="text-xs text-gray-500 mt-2">{offer.description}</p>}
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => openEdit(offer)} className="flex-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Edit</button>
                                <button onClick={() => handleDelete(offer.id)} className="px-3 py-2 text-sm rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'Products' && (
                <div className="card-animated p-6 text-gray-400">Product management coming soon.</div>
            )}

            {activeTab === 'Prizes' && (
                <div className="card-animated p-6 text-gray-400">Prize management coming soon.</div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">{editOffer ? 'Edit Package' : 'New Time Package'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Package Name *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g., 2 Hour Pass" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Hours *</label>
                                    <input type="number" step="0.5" min="0.5" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })}
                                        placeholder="2" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Price (₹) *</label>
                                    <input type="number" min="0" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                                        placeholder="180" />
                                </div>
                            </div>
                            {form.hours && <p className="text-xs text-indigo-400">= {Math.round(parseFloat(form.hours || 0) * 60)} minutes</p>}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Description (optional)</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Best value bundle" />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                                Active (visible to customers)
                            </label>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

ShopPage.propTypes = {
    cafeInfo: PropTypes.object,
};

export default ShopPage;
