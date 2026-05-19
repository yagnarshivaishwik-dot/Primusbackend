/**
 * API base-URL resolution + auth/CSRF helpers for NoLag.
 *
 * Kept in sync with PrimusClient/src/utils/api.js so the kiosk handshake
 * reaches the same backend contract.
 */

const ENV_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  null;

const PRODUCTION_API_URL = 'https://api.primustech.in';
const STORAGE_KEY = 'primus_api_base';
const JWT_KEY = 'primus_jwt';
// License key for the kiosk PC — written after the handshake completes
// (handshakeService.js). Sent as `X-License-Key` on every backend request
// so cafe-scoped endpoints (shop/client/packs, etc.) can resolve cafe_id
// even when the customer's JWT doesn't carry one yet.
const LICENSE_KEY_KEY = 'primus_license_key';

function inKioskHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location?.hostname || '';
  return Boolean(
    window.__TAURI__ ||
      window.__TAURI_INTERNALS__ ||
      host.includes('tauri') ||
      host === 'primus.local',
  );
}

function computeDefaultBase() {
  try {
    if (inKioskHost()) return PRODUCTION_API_URL;

    const host = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    const parts = host.split('.');
    if (parts.length >= 2) {
      return `https://api.${parts.slice(-2).join('.')}`;
    }
  } catch {
    /* ignore */
  }
  return PRODUCTION_API_URL;
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getApiBase() {
  const stored = readStored();
  if (stored) return stored.replace(/\/$/, '');
  if (ENV_BASE) return ENV_BASE.replace(/\/$/, '');
  return computeDefaultBase();
}

export function setApiBase(url) {
  if (!url || typeof url !== 'string') return;
  try {
    localStorage.setItem(STORAGE_KEY, url.replace(/\/$/, ''));
  } catch {
    /* ignore */
  }
}

export function presetApiBases() {
  const out = [];
  if (ENV_BASE) out.push(ENV_BASE.replace(/\/$/, ''));
  const stored = readStored();
  if (stored) out.push(stored.replace(/\/$/, ''));
  out.push(PRODUCTION_API_URL, computeDefaultBase(), 'http://localhost:8000');
  return Array.from(new Set(out));
}

export function authHeaders() {
  try {
    const token = localStorage.getItem(JWT_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function csrfHeaders() {
  try {
    if (typeof document === 'undefined') return {};
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    if (match && match[1]) {
      return { 'X-CSRF-Token': decodeURIComponent(match[1]) };
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function setJwt(token) {
  try {
    if (token) localStorage.setItem(JWT_KEY, token);
    else localStorage.removeItem(JWT_KEY);
  } catch {
    /* ignore */
  }
}

export function getJwt() {
  try {
    return localStorage.getItem(JWT_KEY);
  } catch {
    return null;
  }
}

export function setLicenseKey(key) {
  try {
    if (key) localStorage.setItem(LICENSE_KEY_KEY, String(key));
    else localStorage.removeItem(LICENSE_KEY_KEY);
  } catch {
    /* ignore */
  }
}

export function getLicenseKey() {
  try {
    return localStorage.getItem(LICENSE_KEY_KEY);
  } catch {
    return null;
  }
}

/**
 * Returns `{ 'X-License-Key': '...' }` when the kiosk has completed its
 * handshake and the license key is on hand, else `{}`. Spread into every
 * backend request from api/client.js so cafe-scoped endpoints can resolve
 * cafe_id even when the user's JWT lacks one (typical for fresh customer
 * signups at the kiosk).
 */
export function licenseKeyHeaders() {
  const key = getLicenseKey();
  return key ? { 'X-License-Key': key } : {};
}
