/**
 * Prizes — admin configures redeemable items under /api/v1/prize/*.
 * Client reads the active list and redeems with coins.
 */

import { apiGet, apiPost } from '@/app/api/client';

function normalize(row) {
  return {
    id: row.id,
    name: row.name,
    coinCost: row.coin_cost ?? row.cost ?? 0,
    stock: row.stock ?? null,
    description: row.description || '',
    image: row.image_url || null,
    tier: (row.tier || 'bronze').toLowerCase(),
    category: row.category || '',
    active: row.active !== false,
    createdAt: row.created_at || null,
  };
}

export async function list() {
  const rows = await apiGet('/api/v1/prize/').catch(() => []);
  return Array.isArray(rows) ? rows.map(normalize) : [];
}

export async function redeem(prizeId) {
  return apiPost(`/api/v1/prize/redeem/${prizeId}`);
}
