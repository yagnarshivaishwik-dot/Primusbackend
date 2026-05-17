/**
 * Shop service — live admin-configured time packs from the Primus backend.
 *
 *   GET  /api/v1/shop/client/packs  — primary (cafe-scoped, client-facing)
 *   GET  /api/v1/offer/             — fallback / legacy shape
 *   POST /api/v1/shop/purchase      — record a purchase
 */

import { apiGet, apiPost } from '@/app/api/client';
import { audit } from '@/app/api/audit';

function minutesLabel(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} Minutes`;
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? '1 Hour' : `${h} Hours`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function normalize(row) {
  // Backend returns hours_minutes (Inventory v2). Older shop endpoints
  // returned `minutes` or `hours`. Accept all three.
  const minutes =
    row.hours_minutes ?? row.minutes ?? Math.round((row.hours || 0) * 60);
  const priceRupees =
    typeof row.price === 'number' ? row.price : Number(row.price) || 0;
  const bonusMinutes = Number(row.bonus_minutes ?? 0) || 0;
  const discountPercent = Number(row.discount_percent ?? 0) || 0;
  const taxPercent = Number(row.tax_percent ?? 0) || 0;

  // Effective price after the per-package discount (this is what the
  // user actually pays — the kiosk total reflects this, then the
  // backend recomputes server-side at checkout time so it can't be
  // tampered with).
  const effectivePrice =
    discountPercent > 0
      ? Math.max(0, +(priceRupees * (100 - discountPercent) / 100).toFixed(2))
      : priceRupees;

  return {
    id: row.id,
    name: row.name || minutesLabel(minutes) || 'Pack',
    description: row.description || '',
    // Original list price + computed effective price so the UI can
    // strike-through the original when a discount applies.
    listPrice: priceRupees,
    price: effectivePrice,
    priceRupees: effectivePrice,
    minutes,
    bonusMinutes,
    discountPercent,
    taxPercent,
    hours: row.hours ?? minutes / 60,
    active: row.active !== false,
    category: row.category || 'Game Passes',
    icon: row.icon_url || row.image || '⏱',
    thumbnailUrl: row.thumbnail_url || row.icon_url || null,
    badge:
      row.badge ||
      (discountPercent > 0 ? `-${Math.round(discountPercent)}%` : null),
    isHappyHourOnly: !!row.is_happy_hour_only,
    happyHourStart: row.happy_hour_start || null,
    happyHourEnd: row.happy_hour_end || null,
    displayOrder: Number(row.display_order ?? 0) || 0,
  };
}

async function fetchPacks() {
  try {
    const primary = await apiGet('/api/v1/shop/client/packs');
    if (Array.isArray(primary) && primary.length) return primary.map(normalize);
  } catch {
    /* ignore — fall through */
  }
  const legacy = await apiGet('/api/v1/offer/').catch(() => []);
  return Array.isArray(legacy) ? legacy.map(normalize) : [];
}

export const shopService = {
  list: () => fetchPacks(),
  byId: async (id) => {
    const all = await fetchPacks();
    return all.find((i) => String(i.id) === String(id)) || null;
  },
  byCategory: async (category) => {
    const all = await fetchPacks();
    if (!category || category === 'All') return all;
    return all.filter((i) => i.category === category);
  },
  myOffers: () => apiGet('/api/v1/offer/mine').catch(() => []),
  purchase: async ({ packId, pcId, userId, paymentMethod = 'cash' }) => {
    audit('shop.purchase.start', { pack_id: packId, pc_id: pcId, user_id: userId });
    try {
      const res = await apiPost('/api/v1/shop/purchase', {
        pack_id: packId,
        client_id: pcId,
        user_id: userId,
        payment_method: paymentMethod,
      });
      audit('shop.purchase.ok', { pack_id: packId, purchase_id: res?.purchase_id });
      return res;
    } catch (err) {
      audit('shop.purchase.fail', { pack_id: packId, error: err?.message });
      throw err;
    }
  },
};

export default shopService;
