import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import {
    Package as PackageIcon,
    Plus,
    Pencil,
    Trash2,
    ToggleLeft,
    ToggleRight,
    ArrowUp,
    ArrowDown,
    X,
    Image as ImageIcon,
    Clock,
} from 'lucide-react';
import { getApiBase, authHeaders, showToast } from '../../utils/api';

// ── Time-Packages (Inventory v2) ──────────────────────────────────────
// Admin CRUD over /api/offer/. Backend OfferIn schema:
//   { name, description?, price, hours_minutes,
//     thumbnail_url?, bonus_minutes, discount_percent, tax_percent,
//     display_order, is_happy_hour_only, happy_hour_start? (HH:MM),
//     happy_hour_end? (HH:MM) }
// Backed by the alembic migration 010_offer_inventory_v2 + cafe-DB
// equivalent. Every mutation broadcasts `inventory.updated` via WebSocket
// so kiosks re-fetch their package list in real time.

const EMPTY_FORM = {
    name: '',
    description: '',
    price: '',
    hours_minutes: '',
    bonus_minutes: '0',
    discount_percent: '0',
    tax_percent: '0',
    display_order: '0',
    is_happy_hour_only: false,
    happy_hour_start: '',
    happy_hour_end: '',
    thumbnail_url: '',
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const PackagesPage = ({ cafeInfo }) => {
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null); // null = creating
    const [form, setForm] = useState(EMPTY_FORM);

    const fetchOffers = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, '');
            const res = await axios.get(
                `${base}/api/offer/?include_inactive=true`,
                { headers: authHeaders() },
            );
            setOffers(res.data || []);
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to load packages');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOffers();
    }, [fetchOffers]);

    // --- Modal handlers --------------------------------------------------
    const openCreate = () => {
        setEditingId(null);
        setForm({
            ...EMPTY_FORM,
            display_order: String(offers.length),
        });
        setShowModal(true);
    };

    const openEdit = (o) => {
        setEditingId(o.id);
        setForm({
            name: o.name || '',
            description: o.description || '',
            price: o.price != null ? String(o.price) : '',
            hours_minutes: o.hours_minutes != null ? String(o.hours_minutes) : '',
            bonus_minutes: String(o.bonus_minutes ?? 0),
            discount_percent: String(o.discount_percent ?? 0),
            tax_percent: String(o.tax_percent ?? 0),
            display_order: String(o.display_order ?? 0),
            is_happy_hour_only: !!o.is_happy_hour_only,
            happy_hour_start: o.happy_hour_start || '',
            happy_hour_end: o.happy_hour_end || '',
            thumbnail_url: o.thumbnail_url || '',
        });
        setShowModal(true);
    };

    const validateForm = () => {
        if (!form.name.trim()) {
            showToast('Package name is required');
            return false;
        }
        const price = parseFloat(form.price);
        if (Number.isNaN(price) || price < 0) {
            showToast('Price must be a non-negative number');
            return false;
        }
        const minutes = parseInt(form.hours_minutes, 10);
        if (Number.isNaN(minutes) || minutes <= 0) {
            showToast('Duration (minutes) must be a positive integer');
            return false;
        }
        const disc = parseFloat(form.discount_percent || '0');
        if (Number.isNaN(disc) || disc < 0 || disc > 100) {
            showToast('Discount must be between 0 and 100');
            return false;
        }
        const tax = parseFloat(form.tax_percent || '0');
        if (Number.isNaN(tax) || tax < 0 || tax > 100) {
            showToast('Tax % must be between 0 and 100');
            return false;
        }
        if (form.happy_hour_start && !HHMM.test(form.happy_hour_start)) {
            showToast('Happy-hour start must be HH:MM (00:00..23:59)');
            return false;
        }
        if (form.happy_hour_end && !HHMM.test(form.happy_hour_end)) {
            showToast('Happy-hour end must be HH:MM (00:00..23:59)');
            return false;
        }
        return true;
    };

    const buildPayload = () => ({
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        hours_minutes: parseInt(form.hours_minutes, 10),
        bonus_minutes: parseInt(form.bonus_minutes || '0', 10),
        discount_percent: parseFloat(form.discount_percent || '0'),
        tax_percent: parseFloat(form.tax_percent || '0'),
        display_order: parseInt(form.display_order || '0', 10),
        is_happy_hour_only: !!form.is_happy_hour_only,
        happy_hour_start: form.happy_hour_start || null,
        happy_hour_end: form.happy_hour_end || null,
        thumbnail_url: form.thumbnail_url.trim() || null,
    });

    const handleSave = async () => {
        if (!validateForm()) return;
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, '');
            const payload = buildPayload();

            if (editingId == null) {
                await axios.post(`${base}/api/offer/`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast(`Package "${payload.name}" created`);
            } else {
                await axios.patch(`${base}/api/offer/${editingId}`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast(`Package "${payload.name}" updated`);
            }
            setShowModal(false);
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save package');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (o) => {
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.post(
                `${base}/api/offer/${o.id}/toggle`,
                {},
                { headers: authHeaders() },
            );
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Toggle failed');
        }
    };

    const handleDelete = async (o, hard = false) => {
        const what = hard ? 'permanently delete' : 'disable';
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Are you sure you want to ${what} "${o.name}"?`)) return;
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.delete(
                `${base}/api/offer/${o.id}${hard ? '?hard=true' : ''}`,
                { headers: authHeaders() },
            );
            showToast(`"${o.name}" ${hard ? 'deleted' : 'disabled'}`);
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Delete failed');
        }
    };

    // Move up/down using display_order. Sends only the swapped pair to keep
    // the request body small; backend POST /reorder accepts any subset.
    const handleMove = async (idx, delta) => {
        const sorted = [...offers].sort(
            (a, b) =>
                (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id,
        );
        const target = idx + delta;
        if (target < 0 || target >= sorted.length) return;
        const a = sorted[idx];
        const b = sorted[target];
        const items = [
            { id: a.id, display_order: b.display_order ?? target },
            { id: b.id, display_order: a.display_order ?? idx },
        ];
        try {
            const base = getApiBase().replace(/\/$/, '');
            await axios.post(`${base}/api/offer/reorder`, items, {
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            });
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Reorder failed');
        }
    };

    const sortedOffers = [...offers].sort(
        (a, b) =>
            (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id,
    );
    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <PackageIcon size={28} className="text-indigo-400" />
                        Time Packages
                    </h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">
                            Inventory for:{' '}
                            <span className="font-semibold">{cafeName}</span>
                        </p>
                    )}
                    <p className="text-sm text-gray-400 mt-1">
                        Packages shown in the kiosk shop. Changes sync to all kiosks
                        in real time via WebSocket.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-lg shadow-indigo-900/30"
                >
                    <Plus size={18} />
                    New Package
                </button>
            </div>

            <div className="mt-6 rounded-xl border border-white/5 overflow-hidden bg-[rgba(15,18,30,0.6)] backdrop-blur">
                <table className="w-full text-left text-sm">
                    <thead className="bg-[rgba(255,255,255,0.04)] text-gray-300 uppercase text-xs tracking-wider">
                        <tr>
                            <th className="px-4 py-3 w-16">Order</th>
                            <th className="px-4 py-3">Package</th>
                            <th className="px-4 py-3 w-28">Duration</th>
                            <th className="px-4 py-3 w-28">Price</th>
                            <th className="px-4 py-3 w-32">Discount / Tax</th>
                            <th className="px-4 py-3 w-32">Happy Hour</th>
                            <th className="px-4 py-3 w-24">Status</th>
                            <th className="px-4 py-3 w-44 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="px-4 py-10 text-center text-gray-400"
                                >
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {!loading && sortedOffers.length === 0 && (
                            <tr>
                                <td
                                    colSpan={8}
                                    className="px-4 py-10 text-center text-gray-400"
                                >
                                    No packages yet. Click <strong>New Package</strong>{' '}
                                    to create the first one.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            sortedOffers.map((o, idx) => (
                                <tr
                                    key={o.id}
                                    className="border-t border-white/5 hover:bg-white/[0.02]"
                                >
                                    <td className="px-4 py-3 align-middle">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                disabled={idx === 0}
                                                onClick={() => handleMove(idx, -1)}
                                                className="text-gray-400 disabled:opacity-30 hover:text-white"
                                                aria-label="Move up"
                                            >
                                                <ArrowUp size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={idx === sortedOffers.length - 1}
                                                onClick={() => handleMove(idx, +1)}
                                                className="text-gray-400 disabled:opacity-30 hover:text-white"
                                                aria-label="Move down"
                                            >
                                                <ArrowDown size={14} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        <div className="flex items-center gap-3">
                                            {o.thumbnail_url ? (
                                                <img
                                                    src={o.thumbnail_url}
                                                    alt=""
                                                    className="w-10 h-10 rounded-lg object-cover bg-black/30"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-indigo-900/40 flex items-center justify-center text-indigo-300">
                                                    <ImageIcon size={16} />
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-white font-semibold">
                                                    {o.name}
                                                </div>
                                                {o.description && (
                                                    <div className="text-xs text-gray-400 line-clamp-1">
                                                        {o.description}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-middle text-gray-200">
                                        <div>{o.hours_minutes} min</div>
                                        {!!o.bonus_minutes && (
                                            <div className="text-xs text-emerald-400">
                                                +{o.bonus_minutes} bonus
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-middle text-white">
                                        ₹{Number(o.price).toLocaleString('en-IN')}
                                    </td>
                                    <td className="px-4 py-3 align-middle text-gray-300 text-xs">
                                        {o.discount_percent > 0 && (
                                            <div className="text-amber-400">
                                                -{o.discount_percent}% off
                                            </div>
                                        )}
                                        {o.tax_percent > 0 && (
                                            <div>+{o.tax_percent}% GST</div>
                                        )}
                                        {!o.discount_percent && !o.tax_percent && '—'}
                                    </td>
                                    <td className="px-4 py-3 align-middle text-xs text-gray-300">
                                        {o.is_happy_hour_only ? (
                                            <div className="flex items-center gap-1 text-pink-400">
                                                <Clock size={12} />
                                                {o.happy_hour_start || '--:--'} →{' '}
                                                {o.happy_hour_end || '--:--'}
                                            </div>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        <span
                                            className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                                                o.active
                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                    : 'bg-gray-500/20 text-gray-400'
                                            }`}
                                        >
                                            {o.active ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleToggle(o)}
                                                title={o.active ? 'Disable' : 'Enable'}
                                                className="text-gray-400 hover:text-white"
                                            >
                                                {o.active ? (
                                                    <ToggleRight size={20} />
                                                ) : (
                                                    <ToggleLeft size={20} />
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openEdit(o)}
                                                title="Edit"
                                                className="text-gray-400 hover:text-indigo-300"
                                            >
                                                <Pencil size={18} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(o, false)}
                                                title="Disable (soft delete)"
                                                className="text-gray-400 hover:text-red-400"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <PackageModal
                    isEditing={editingId != null}
                    form={form}
                    setForm={setForm}
                    saving={saving}
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

PackagesPage.propTypes = {
    cafeInfo: PropTypes.shape({
        name: PropTypes.string,
        cafe_name: PropTypes.string,
    }),
};

PackagesPage.defaultProps = {
    cafeInfo: null,
};

// ── Modal ────────────────────────────────────────────────────────────

const PackageModal = ({ isEditing, form, setForm, saving, onClose, onSave }) => {
    const set = (key, value) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-6 overflow-y-auto"
        >
            <div className="bg-[#101524] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl my-10">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h2 className="text-xl font-bold text-white">
                        {isEditing ? 'Edit Package' : 'New Package'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Identity */}
                    <Field label="Name *">
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => set('name', e.target.value)}
                            placeholder="e.g. Power Hour"
                            className="input-glass w-full"
                        />
                    </Field>
                    <Field label="Description">
                        <textarea
                            rows={2}
                            value={form.description}
                            onChange={(e) => set('description', e.target.value)}
                            placeholder="Shown to users in the kiosk shop"
                            className="input-glass w-full"
                        />
                    </Field>
                    <Field label="Thumbnail URL">
                        <input
                            type="url"
                            value={form.thumbnail_url}
                            onChange={(e) => set('thumbnail_url', e.target.value)}
                            placeholder="https://…"
                            className="input-glass w-full"
                        />
                    </Field>

                    {/* Money + minutes */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Price (INR) *">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.price}
                                onChange={(e) => set('price', e.target.value)}
                                className="input-glass w-full"
                            />
                        </Field>
                        <Field label="Duration (minutes) *">
                            <input
                                type="number"
                                min="1"
                                value={form.hours_minutes}
                                onChange={(e) => set('hours_minutes', e.target.value)}
                                className="input-glass w-full"
                            />
                        </Field>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Bonus minutes">
                            <input
                                type="number"
                                min="0"
                                value={form.bonus_minutes}
                                onChange={(e) => set('bonus_minutes', e.target.value)}
                                className="input-glass w-full"
                            />
                        </Field>
                        <Field label="Discount %">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={form.discount_percent}
                                onChange={(e) =>
                                    set('discount_percent', e.target.value)
                                }
                                className="input-glass w-full"
                            />
                        </Field>
                        <Field label="Tax (GST) %">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={form.tax_percent}
                                onChange={(e) => set('tax_percent', e.target.value)}
                                className="input-glass w-full"
                            />
                        </Field>
                    </div>

                    {/* Happy hour */}
                    <div className="rounded-lg border border-white/5 p-4 bg-white/[0.02]">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.is_happy_hour_only}
                                onChange={(e) =>
                                    set('is_happy_hour_only', e.target.checked)
                                }
                                className="w-4 h-4"
                            />
                            <span className="text-sm font-semibold text-white">
                                Happy-hour only
                            </span>
                            <span className="text-xs text-gray-400">
                                Hide outside the time window below
                            </span>
                        </label>
                        {form.is_happy_hour_only && (
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <Field label="Start (HH:MM)">
                                    <input
                                        type="time"
                                        value={form.happy_hour_start}
                                        onChange={(e) =>
                                            set('happy_hour_start', e.target.value)
                                        }
                                        className="input-glass w-full"
                                    />
                                </Field>
                                <Field label="End (HH:MM)">
                                    <input
                                        type="time"
                                        value={form.happy_hour_end}
                                        onChange={(e) =>
                                            set('happy_hour_end', e.target.value)
                                        }
                                        className="input-glass w-full"
                                    />
                                </Field>
                            </div>
                        )}
                    </div>

                    <Field label="Display order">
                        <input
                            type="number"
                            min="0"
                            value={form.display_order}
                            onChange={(e) => set('display_order', e.target.value)}
                            className="input-glass w-full"
                        />
                    </Field>
                </div>

                <div className="flex justify-end gap-3 p-5 border-t border-white/5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-60"
                    >
                        {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
};

PackageModal.propTypes = {
    isEditing: PropTypes.bool.isRequired,
    form: PropTypes.object.isRequired,
    setForm: PropTypes.func.isRequired,
    saving: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
};

const Field = ({ label, children }) => (
    <label className="block">
        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
            {label}
        </span>
        {children}
    </label>
);

Field.propTypes = {
    label: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
};

export default PackagesPage;
