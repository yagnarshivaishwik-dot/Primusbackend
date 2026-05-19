import { apiPost } from '@/app/api/client';

/**
 * Home-page placeholder rewards.
 *
 * Bridge to /api/v1/home/claim-placeholder/{kind} — the kiosk-side mirror
 * of the three hardcoded mock quests on HomePage. Credits a fixed coin
 * amount per kind (backend enforces one claim per UTC day per kind).
 *
 * Lives in its own service so it's easy to delete once the real quest
 * system (admin CRUD + progression engine) ships — see TECH_DEBT.md #21.
 */
export async function claimPlaceholder(kind) {
  if (!kind) throw new Error('kind required');
  return apiPost(`/api/v1/home/claim-placeholder/${kind}`);
}

export const homeService = { claimPlaceholder };
export default homeService;
