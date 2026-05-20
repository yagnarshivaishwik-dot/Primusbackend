import { apiGet, apiPost } from '@/app/api/client';

function safeParseRule(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

/** GET /api/v1/event/ — currently-active events (challenges/quests).
 *  Also extracts target + coin reward from `rule_json` so the Rewards
 *  page's Challenges tab can render progress and reward amounts. */
export async function listEvents() {
  const rows = await apiGet('/api/v1/event/').catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r) => {
        const rule = safeParseRule(r.rule_json);
        const reward = rule.reward || {};
        return {
          id: r.id,
          name: r.name,
          description: r.description || '',
          startTime: r.start_time || null,
          endTime: r.end_time || null,
          active: r.active !== false,
          target: Number(rule.target ?? 1) || 1,
          rewardKind: reward.kind || null,
          rewardAmount: Number(reward.amount ?? 0) || 0,
        };
      })
    : [];
}

export async function progressEvent(id, delta = 1) {
  if (!id) return null;
  return apiPost(`/api/v1/event/progress/${id}`, undefined, { params: { delta } }).catch(() => null);
}

/** POST /api/v1/event/{id}/claim — claim the coin reward for a completed
 *  challenge. Backend is idempotent on completed events. */
export async function claimEvent(id) {
  if (!id) throw new Error('event id required');
  return apiPost(`/api/v1/event/${id}/claim`);
}
