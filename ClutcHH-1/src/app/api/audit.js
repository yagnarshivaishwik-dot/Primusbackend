/**
 * Client-side audit logger. POSTs every meaningful user action to
 * /api/v1/audit/client so the admin portal's Activity Tracker has a
 * real timeline for this PC/user. Fire-and-forget — failures are
 * swallowed to never block the UI, and requests are coalesced through
 * a small queue so bursts don't saturate the network.
 */

import { apiPost } from '@/app/api/client';

const QUEUE = [];
let FLUSH_SCHEDULED = false;

function schedule() {
  if (FLUSH_SCHEDULED) return;
  FLUSH_SCHEDULED = true;
  window.setTimeout(flush, 750);
}

async function flush() {
  FLUSH_SCHEDULED = false;
  while (QUEUE.length > 0) {
    const item = QUEUE.shift();
    try {
      await apiPost('/api/v1/audit/client', item);
    } catch {
      // Keep going — the backend has /api/v1/audit/client; if it's rate
      // limited or temporarily unreachable, we drop this event rather
      // than retry forever. Heartbeat carries health separately.
    }
  }
}

/**
 * @param {string} action  Short verb like "page.view" or "game.launch".
 * @param {object} [detail] Small structured context.
 */
export function audit(action, detail) {
  if (!action) return;
  const payload = {
    action,
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
  };
  QUEUE.push(payload);
  schedule();
}
