const hostname = window.location.hostname;
const isLocal =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.startsWith("192.168.") ||
  hostname.startsWith("10.") ||
  hostname.endsWith(".local");

const rootHost = hostname.startsWith("www.") ? hostname.slice(4) : hostname;

const ENV_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (isLocal ? `http://${hostname}:8000` : `https://api.${rootHost}`);

export function getApiBase() {
  return localStorage.getItem("primus_api_base") || ENV_BASE;
}

export function setApiBase(url) {
  if (url && typeof url === "string") {
    localStorage.setItem("primus_api_base", url.replace(/\/$/, ""));
  }
}

export function authHeaders() {
  const token = localStorage.getItem("primus_jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Centralized toast
export function showToast(message) {
  const rootId = 'primus-toast-root';
  let root = document.getElementById(rootId);
  if (!root) { root = document.createElement('div'); root.id = rootId; root.className = 'primus-toast'; document.body.appendChild(root); }
  const item = document.createElement('div'); item.className = 'primus-toast-item'; item.textContent = message; root.appendChild(item); setTimeout(() => { try { root.removeChild(item); } catch { } }, 4000);
}

// Offline queue for POSTs
const QUEUE_KEY = 'primus_offline_queue_v1';
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { }
}

export async function postWithQueue(url, data, config = {}) {
  const attempt = async () => {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
      body: JSON.stringify(data)
    });
  };
  try {
    const res = await attempt();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json().catch(() => ({}));
  } catch (e) {
    const q = readQueue();
    q.push({ url, data, headers: config.headers || {} });
    writeQueue(q);
    showToast('Action queued (offline). Will retry when online.');
    return null;
  }
}

export async function flushQueue() {
  const q = readQueue();
  if (!q.length) return;
  const next = [];
  for (const item of q) {
    try {
      const res = await fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(item.headers || {}) }, body: JSON.stringify(item.data) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch {
      next.push(item);
    }
  }
  writeQueue(next);
  if (next.length === 0) showToast('All queued actions sent.');
}


