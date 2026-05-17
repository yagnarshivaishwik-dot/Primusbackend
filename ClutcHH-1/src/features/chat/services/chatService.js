/**
 * Kiosk chat service — talks to the same backend endpoints the admin portal
 * uses (`/api/chat/`). Messages are scoped to the customer's cafe by the
 * backend; we just supply the kiosk's pc_id so admins can thread by PC.
 *
 * Wire format matches `backend/app/schemas/communication.py::ChatMessageIn`:
 *   { to_user_id: int | null, pc_id: int | null, message: str }
 *
 * `from_user_id`, `cafe_id`, and `timestamp` are filled in by the backend
 * from the JWT and request context, so we don't send them.
 */
import { apiGet, apiPost } from '@/app/api/client';

export const chatService = {
  /**
   * Fetch chat history visible to the current user. Backend already scopes
   * by cafe_id; we filter to messages for this kiosk (pc_id match).
   */
  async list(pcId) {
    const rows = await apiGet('/api/chat/').catch(() => []);
    if (!Array.isArray(rows)) return [];
    // Keep only the conversation for this PC (admin ↔ this kiosk).
    // Compare as numbers — the C# bridge stores pc_id as a string while the
    // backend returns it as an int, so strict `===` silently filters out
    // every admin-sent history row.
    const wanted = pcId != null ? Number(pcId) : null;
    return rows
      .filter((m) => wanted == null || Number(m.pc_id) === wanted)
      .sort(
        (a, b) =>
          new Date(a.timestamp || 0).getTime() -
          new Date(b.timestamp || 0).getTime(),
      );
  },

  /**
   * Customer → admins. `to_user_id` is null so the message broadcasts to
   * every admin viewing this PC, matching the admin-portal pattern.
   */
  send({ pcId, message }) {
    return apiPost('/api/chat/', {
      pc_id: pcId ?? null,
      to_user_id: null,
      message,
    });
  },
};

export default chatService;
