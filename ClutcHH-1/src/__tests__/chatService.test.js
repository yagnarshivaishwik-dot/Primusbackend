/**
 * Tests for chatService — list filtering and send payload shape.
 *
 * Forensic audit M19 — chat history filtering had a `===` int vs string
 * bug that silently dropped admin-sent rows. We assert numeric coercion
 * via the public ``list(pcId)`` API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
vi.mock('@/app/api/client', () => ({
  apiGet: (...a) => apiGetMock(...a),
  apiPost: (...a) => apiPostMock(...a),
  ApiError: class ApiError extends Error {},
}));

import { chatService } from '@/features/chat/services/chatService.js';

describe('chatService', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
  });

  it('list() compares pc_id by number — admin-sent rows are NOT dropped', async () => {
    apiGetMock.mockResolvedValue([
      { id: 1, pc_id: 7, message: 'admin says hi', timestamp: '2025-01-01' },
      { id: 2, pc_id: '7', message: 'kiosk replies', timestamp: '2025-01-02' },
      { id: 3, pc_id: 99, message: 'other PC', timestamp: '2025-01-03' },
    ]);

    const rows = await chatService.list('7');

    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.message)).toEqual(['admin says hi', 'kiosk replies']);
  });

  it('list() returns [] when API rejects', async () => {
    apiGetMock.mockRejectedValueOnce(new Error('network'));
    const rows = await chatService.list(1);
    expect(rows).toEqual([]);
  });

  it('send() posts the documented wire shape — no extra identity fields', () => {
    chatService.send({ pcId: 7, message: 'hello' });

    expect(apiPostMock).toHaveBeenCalledWith('/api/chat/', {
      pc_id: 7,
      to_user_id: null,
      message: 'hello',
    });
    // Forensic audit: client must NEVER hand-roll from_user_id/cafe_id —
    // those are set server-side from JWT.
    const payload = apiPostMock.mock.calls[0][1];
    expect(payload).not.toHaveProperty('from_user_id');
    expect(payload).not.toHaveProperty('cafe_id');
  });

  it('list() sorts ascending by timestamp', async () => {
    apiGetMock.mockResolvedValue([
      { id: 2, pc_id: 1, message: 'newer', timestamp: '2025-02-01' },
      { id: 1, pc_id: 1, message: 'older', timestamp: '2025-01-01' },
    ]);
    const rows = await chatService.list(1);
    expect(rows.map((r) => r.message)).toEqual(['older', 'newer']);
  });
});
