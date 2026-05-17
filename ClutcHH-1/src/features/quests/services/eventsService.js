import { apiGet, apiPost } from '@/app/api/client';

/** GET /api/v1/event/ — currently-active events (challenges/quests). */
export async function listEvents() {
  const rows = await apiGet('/api/v1/event/').catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        startTime: r.start_time || null,
        endTime: r.end_time || null,
        active: r.active !== false,
      }))
    : [];
}

export async function progressEvent(id, delta = 1) {
  if (!id) return null;
  return apiPost(`/api/v1/event/progress/${id}`, undefined, { params: { delta } }).catch(() => null);
}
