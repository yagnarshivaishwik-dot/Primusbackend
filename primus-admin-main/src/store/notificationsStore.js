let notifications = [];
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(notifications);
    } catch (e) {
      console.error('notificationsStore listener error', e);
    }
  });
}

export function subscribeNotifications(handler) {
  if (typeof handler !== 'function') return () => {};
  listeners.add(handler);
  // Immediately emit current state
  handler(notifications);
  return () => {
    listeners.delete(handler);
  };
}

export function addNotification(entry) {
  const n = {
    id: entry.id || String(Date.now()) + Math.random().toString(36).slice(2),
    type: entry.type || 'info',
    client_id: entry.client_id || null,
    client_name: entry.client_name || null,
    user_name: entry.user_name || null,
    preview: entry.preview || '',
    ts: entry.ts || Math.floor(Date.now() / 1000),
    read: false,
  };
  notifications = [n, ...notifications];
  notify();
}

export function markNotificationRead(id) {
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  notify();
}

export function markNotificationsReadForClient(clientId) {
  notifications = notifications.map((n) =>
    n.client_id === clientId ? { ...n, read: true } : n
  );
  notify();
}

export function getNotifications() {
  return notifications;
}


