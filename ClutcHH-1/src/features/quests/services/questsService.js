import { apiGet, apiPost } from '@/app/api/client';

/**
 * Quests service — hits the modern /api/v1/quests/ endpoint.
 *
 * Distinct from eventsService (legacy /api/v1/event/). The quests router
 * returns one row per active quest for the current user joined with their
 * progress, so a single GET fills the kiosk home page.
 *
 * `claim(id)` POSTs to /api/v1/quests/{id}/claim — the backend credits
 * coin rewards (XP is logged but not yet credited — no users.xp column
 * yet, tracked in TECH_DEBT.md).
 */

function normalize(row) {
  if (!row) return null;
  const target = Number(row.target ?? 0) || 0;
  const progress = Number(row.progress ?? 0) || 0;
  const percent = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    target,
    progress,
    percent,
    completed: row.completed === true,
    claimed: row.claimed === true,
    rewardLabel: row.reward_label || '',
    rewardKind: row.reward_kind || null,
    rewardAmount: Number(row.reward_amount ?? 0) || 0,
    expiresAt: row.expires_at || null,
  };
}

export async function listQuests() {
  const rows = await apiGet('/api/v1/quests/').catch(() => []);
  return Array.isArray(rows) ? rows.map(normalize).filter(Boolean) : [];
}

export async function claimQuest(id) {
  if (!id) throw new Error('Quest id required.');
  const row = await apiPost(`/api/v1/quests/${id}/claim`);
  return normalize(row);
}

export const questsService = {
  list: listQuests,
  claim: claimQuest,
};

export default questsService;
