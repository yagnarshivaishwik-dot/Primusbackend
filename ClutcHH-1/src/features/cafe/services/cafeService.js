/**
 * Cafe-level information and admin-configured kiosk customization.
 *
 *   GET /api/v1/cafe/mine                              — cafe branding basics
 *   GET /api/v1/settings?category=center_info          — admin-configured contact info
 *   GET /api/v1/settings?category=client_customization — theme + backgrounds + logo
 */

import { apiGet } from '@/app/api/client';

export async function getCafe() {
  return apiGet('/api/v1/cafe/mine').catch(() => null);
}

function settingsToMap(rows) {
  const map = {};
  if (!Array.isArray(rows)) return map;
  rows.forEach((r) => {
    if (!r?.key) return;
    map[r.key] = r.value;
  });
  return map;
}

export async function getCenterInfo() {
  const rows = await apiGet('/api/v1/settings', { category: 'center_info' }).catch(() => []);
  return settingsToMap(rows);
}

export async function getCustomization() {
  const rows = await apiGet('/api/v1/settings', { category: 'client_customization' }).catch(
    () => [],
  );
  return settingsToMap(rows);
}
