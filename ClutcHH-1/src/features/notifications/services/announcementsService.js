import { apiGet, apiPost } from '@/app/api/client';

/** GET /api/v1/announcement/ — active, time-windowed announcements. */
export async function listAnnouncements() {
  const rows = await apiGet('/api/v1/announcement/').catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r) => ({
        id: r.id,
        title: r.title || 'Announcement',
        body: r.content || r.body || '',
        type: r.type || 'info',
        startTime: r.start_time || null,
        endTime: r.end_time || null,
        active: r.active !== false,
      }))
    : [];
}

/** GET /api/v1/notification/ — per-user notifications. */
export async function listNotifications() {
  const rows = await apiGet('/api/v1/notification/').catch(() => []);
  return Array.isArray(rows)
    ? rows.map((r) => ({
        id: r.id,
        title: r.type || 'Notification',
        body: r.content || '',
        type: r.type || 'info',
        createdAt: r.created_at || null,
        unread: r.read !== true,
      }))
    : [];
}

export async function markRead(id) {
  return apiPost(`/api/v1/notification/${id}/read`).catch(() => null);
}
