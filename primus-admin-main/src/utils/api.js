// Phase 3 (audit FE-C2 / B.8): the backend URL is fixed at build time via
// VITE_API_BASE_URL. The previous version pulled the URL from localStorage
// and exposed a window.prompt UI for the user to edit it — that turned the
// login screen into a DNS-hijacking pivot (any compromised network or
// social-engineering attack could redirect the admin to an attacker
// backend, capture the JWT, and replay it against the real backend).
//
// Now: the URL is resolved purely from build-time env. There is no runtime
// override path, so the value cannot be changed by the operator at the
// kiosk. Local-development fallbacks remain ONLY when the page is loaded
// from a private hostname.

const hostname = (typeof window !== "undefined" && window.location?.hostname) || "";

const isLocalHost =
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.startsWith("192.168.") ||
  hostname.startsWith("10.") ||
  hostname.endsWith(".local");

// Production fallback: when VITE_API_BASE_URL isn't baked into the build
// (e.g. the env var was forgotten in the Vercel project settings), default
// to the canonical Primus backend so HTTP + WebSocket calls still resolve
// instead of falling back to "" and hitting the static host with 404s.
// Override at build time with VITE_API_BASE_URL when deploying to a
// different backend (staging, self-hosted, etc.).
const PROD_FALLBACK_BASE = "https://api.primustech.in";

const ENV_BASE_RAW =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL) ||
  (isLocalHost ? `http://${hostname}:8000` : PROD_FALLBACK_BASE);

if (!ENV_BASE_RAW) {
  // Should be unreachable now that PROD_FALLBACK_BASE always supplies a
  // value for non-local hosts, but keep the guard for defense in depth.
  // eslint-disable-next-line no-console
  console.error(
    "[primus] No backend base URL resolved; the admin app will not reach the backend."
  );
}

// Strip trailing slash exactly once.
const ENV_BASE = ENV_BASE_RAW.replace(/\/$/, "");

export function getApiBase() {
  return ENV_BASE;
}

// setApiBase is preserved as a no-op for backwards compatibility with any
// caller that still imports it. Production behavior is to ignore — the
// only legal source of truth is VITE_API_BASE_URL.
export function setApiBase(_url) {
  if (typeof window !== "undefined" && window.console) {
    // eslint-disable-next-line no-console
    console.warn(
      "[primus] setApiBase() is disabled in Phase 3+ — backend URL is set at build time via VITE_API_BASE_URL."
    );
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

// Phase 3 (audit FE-C3): never persist Authorization or other auth
// headers to localStorage. The queued envelope only carries non-auth
// headers; on flush we re-attach the CURRENT bearer token via
// authHeaders() so the request is signed with whatever JWT is valid at
// retry time, not whatever was current when the request was queued.
function stripAuthHeaders(headers) {
  const out = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    const lower = String(k).toLowerCase();
    if (lower === "authorization" || lower === "x-csrf-token" || lower.startsWith("x-pc-")) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function postWithQueue(url, data, config = {}) {
  const attempt = async () => {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers || {}), ...authHeaders() },
      body: JSON.stringify(data)
    });
  };
  try {
    const res = await attempt();
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json().catch(() => ({}));
  } catch (e) {
    const q = readQueue();
    q.push({ url, data, headers: stripAuthHeaders(config.headers) });
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
      const res = await fetch(item.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...stripAuthHeaders(item.headers || {}),
          ...authHeaders(),  // re-attach CURRENT auth at retry time
        },
        body: JSON.stringify(item.data),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch {
      next.push(item);
    }
  }
  writeQueue(next);
  if (next.length === 0) showToast('All queued actions sent.');
}


