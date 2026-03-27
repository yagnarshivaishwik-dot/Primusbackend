// Use type assertion for Tauri window properties to avoid conflicts with @tauri-apps types

interface QueueItem {
  url: string;
  data: unknown;
  headers: Record<string, string>;
}

interface PostConfig {
  headers?: Record<string, string>;
}

const ENV_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || null;

// Production API URL - used as default for Tauri builds
const PRODUCTION_API_URL = "https://api.primustech.in";

function computeDefaultBase(): string {
  try {
    const host = typeof window !== 'undefined' ? (window.location?.hostname || '') : '';

    // Check if running in Tauri (webview uses localhost/tauri.localhost)
    // In this case, we should use the production API, not localhost
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const isTauri = typeof window !== 'undefined' && (
      win.__TAURI__ ||
      win.__TAURI_INTERNALS__ ||
      host.includes('tauri')
    );

    if (isTauri) {
      // Tauri desktop app - use production API
      return PRODUCTION_API_URL;
    }

    // Web browser - detect from hostname
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000';
    }

    const parts = host.split('.');
    if (parts.length >= 2) {
      const apex = parts.slice(-2).join('.');
      return `https://api.${apex}`;
    }
  } catch { }

  // Fallback to production for safety
  return PRODUCTION_API_URL;
}

export function getApiBase(): string {
  const stored = localStorage.getItem("primus_api_base");
  if (stored) return stored;
  if (ENV_BASE) return (ENV_BASE as string).replace(/\/$/, "");
  // Default to a sane local/backend value based on window.location
  return computeDefaultBase();
}

export function setApiBase(url: string): void {
  if (url && typeof url === "string") {
    localStorage.setItem("primus_api_base", url.replace(/\/$/, ""));
  }
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("primus_jwt");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// CSRF helper: read csrf_token cookie and return header
export function csrfHeaders(): Record<string, string> {
  try {
    if (typeof document === "undefined") return {};
    const match = document.cookie.match(/(?:^|;\\s*)csrf_token=([^;]+)/);
    if (match && match[1]) {
      return { "X-CSRF-Token": decodeURIComponent(match[1]) };
    }
  } catch {
    // ignore failures
  }
  return {};
}

// Centralized toast
export function showToast(message: string): void {
  const rootId = 'primus-toast-root';
  let root = document.getElementById(rootId);
  if (!root) { root = document.createElement('div'); root.id = rootId; root.className = 'primus-toast'; document.body.appendChild(root); }
  const item = document.createElement('div'); item.className = 'primus-toast-item'; item.textContent = message; root.appendChild(item); setTimeout(() => { try { root?.removeChild(item); } catch { } }, 4000);
}

// Offline queue for POSTs
const QUEUE_KEY = 'primus_offline_queue_v1';
function readQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[]; } catch { return []; }
}
function writeQueue(q: QueueItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { }
}

export async function postWithQueue(url: string, data: unknown, config: PostConfig = {}): Promise<unknown> {
  const attempt = async () => {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders(), ...(config.headers || {}) },
      body: JSON.stringify(data)
    });
  };
  try {
    const res = await attempt();
    if (res.ok) return await res.json().catch(() => ({}));
    if (res.status === 0 || res.status >= 500) {
      const q = readQueue();
      q.push({ url, data, headers: config.headers || {} });
      writeQueue(q);
      showToast('Server unreachable. Action queued and will retry.');
      return null;
    }
    const text = await res.text().catch(() => null);
    throw new Error(text || ('HTTP ' + res.status));
  } catch (e: unknown) {
    const error = e as Error;
    if (error && (error.name === 'TypeError' || /Failed to fetch/i.test(String(error.message || '')))) {
      const q = readQueue();
      q.push({ url, data, headers: config.headers || {} });
      writeQueue(q);
      showToast('Network error. Action queued and will retry.');
      return null;
    }
    throw e;
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

export function presetApiBases() {
  const presets = [];

  // Prefer any build-time env base first so it's the default in fresh installs
  if (ENV_BASE) {
    presets.push(ENV_BASE.replace(/\/$/, ''));
  }

  // Include any value the user previously selected
  try {
    const stored = localStorage.getItem("primus_api_base");
    if (stored) {
      presets.push(stored);
    }
  } catch {
    // ignore storage failures
  }

  // Fallbacks - always include production URL
  presets.push(PRODUCTION_API_URL, computeDefaultBase(), 'http://localhost:8000');

  return Array.from(new Set(presets));
}


