import { apiGet } from '@/app/api/client';

export async function list() {
  const rows = await apiGet('/api/v1/leaderboard/').catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r) => ({
        id: r.id,
        name: r.name,
        metric: r.metric,
        scope: r.scope,
        active: r.active !== false,
      }))
    : [];
}

export async function entries(leaderboardId) {
  if (!leaderboardId) return [];
  const rows = await apiGet(`/api/v1/leaderboard/${leaderboardId}`).catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r, i) => ({
        rank: r.rank || i + 1,
        userId: r.user_id || r.userId,
        name: r.name || r.user_name || `Player ${i + 1}`,
        score: r.score ?? r.value ?? 0,
      }))
    : [];
}
