/**
 * Thin fetch-based API client for the Primus FastAPI backend.
 *
 * Mirrors the house style used by primus-admin-main/src/utils/api.js:
 * plain function, JWT via Authorization header, no axios.
 *
 * Every call:
 *   - Resolves base URL via getApiBase()
 *   - Attaches Authorization + X-CSRF-Token headers when available
 *   - Parses JSON response and rejects with a readable message on !ok
 *   - Surfaces network failures as `ApiError` with .status === 0
 */

import {
  getApiBase,
  authHeaders,
  csrfHeaders,
  licenseKeyHeaders,
} from '@/app/bridge/config';

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function joinUrl(base, path) {
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

async function parseBody(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

function errMessage(body, fallback) {
  if (!body) return fallback;
  if (typeof body === 'string') return body || fallback;
  return body.detail || body.message || body.error || fallback;
}

/**
 * Generic request helper.
 * @param {string} path          Absolute-style path such as `/api/v1/wallet/balance`
 * @param {RequestInit & { params?: Record<string, unknown>, body?: unknown, raw?: boolean }} [opts]
 * @returns {Promise<unknown>}
 */
export async function api(path, opts = {}) {
  const { params, body, headers: extraHeaders, raw = false, ...init } = opts;

  let url = joinUrl(getApiBase(), path);
  if (params && typeof params === 'object') {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.append(k, String(v));
    });
    const qs = q.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  const method = (init.method || (body !== undefined ? 'POST' : 'GET')).toUpperCase();

  const finalHeaders = {
    Accept: 'application/json',
    ...authHeaders(),
    ...csrfHeaders(),
    // X-License-Key lets the backend resolve cafe_id when the user's JWT
    // doesn't carry one (typical for customers who just signed up at a
    // kiosk). See backend/app/auth/context.py — the resolver checks this
    // header as a last-resort fallback after JWT and UserCafeMap.
    ...licenseKeyHeaders(),
    ...(body !== undefined && !(body instanceof FormData) && !(body instanceof URLSearchParams)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(extraHeaders || {}),
  };

  let encodedBody = body;
  if (
    body !== undefined &&
    body !== null &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    typeof body !== 'string'
  ) {
    encodedBody = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...init,
      method,
      headers: finalHeaders,
      body: method === 'GET' || method === 'HEAD' ? undefined : encodedBody,
    });
  } catch (err) {
    throw new ApiError(err?.message || 'Network error', { status: 0 });
  }

  if (raw) return res;

  const bodyOut = await parseBody(res);

  if (!res.ok) {
    // Token-expired / unauthenticated surfaces: fire a window event so
    // a single top-level listener can drive forced logout + redirect to
    // /login. Done here (not in every catch site) so an idle customer
    // whose JWT has aged out can't get stranded on a page that quietly
    // 401s — the most common previous symptom was "kiosk frozen, no
    // logout button accessible". Excluded the auth/login route itself
    // so a wrong-password attempt doesn't fire the global signOut.
    if (res.status === 401 && !path.includes('/auth/login')) {
      try {
        window.dispatchEvent(new CustomEvent('auth:unauthorized', {
          detail: { path, status: res.status },
        }));
      } catch { /* dispatchEvent unsupported in some test envs */ }
    }
    throw new ApiError(errMessage(bodyOut, `HTTP ${res.status}`), {
      status: res.status,
      body: bodyOut,
    });
  }
  return bodyOut;
}

export const apiGet = (path, params, extra) =>
  api(path, { method: 'GET', params, ...(extra || {}) });

export const apiPost = (path, body, extra) =>
  api(path, { method: 'POST', body, ...(extra || {}) });

export const apiPut = (path, body, extra) =>
  api(path, { method: 'PUT', body, ...(extra || {}) });

export const apiDelete = (path, extra) => api(path, { method: 'DELETE', ...(extra || {}) });
