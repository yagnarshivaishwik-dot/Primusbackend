/**
 * Device-registration handshake.
 *
 * Ported from PrimusClient/src/services/handshake.ts. The flow:
 *   1. Admin login with email/password         → JWT
 *   2. Hardware fingerprint from native host   → `generate_hardware_fingerprint`
 *   3. Cafe lookup (optional, for logging)
 *   4. Fetch active license for cafe
 *   5. Register this PC with the backend       → device_secret
 *   6. Persist device credentials locally      → `save_device_credentials`
 *
 * Any failure rejects with a human-readable message suitable for display.
 */

import { invoke } from '@/app/bridge/invoke';
import { getApiBase, setLicenseKey } from '@/app/bridge/config';

/**
 * @typedef {object} HandshakeResult
 * @property {number} pc_id
 * @property {string} license_key
 * @property {number} cafe_id
 * @property {string} name
 */

async function parseErr(res, fallback) {
  let detail = fallback;
  try {
    const body = await res.json();
    detail = body?.detail || body?.message || JSON.stringify(body);
  } catch {
    try {
      detail = (await res.text()) || fallback;
    } catch {
      /* ignore */
    }
  }
  return new Error(`${fallback}: ${detail}`);
}

async function adminLogin(baseUrl, email, password) {
  const form = new URLSearchParams();
  form.append('username', email);
  form.append('password', password);

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    credentials: 'include',
  });
  if (!res.ok) throw await parseErr(res, 'Admin login failed');
  const json = await res.json();
  if (!json.access_token) throw new Error('Admin login returned no access_token');
  return json.access_token;
}

async function fetchLicense(baseUrl, token) {
  const hdr = { Authorization: `Bearer ${token}` };

  async function tryPath(path) {
    try {
      const res = await fetch(`${baseUrl}/api${path}`, { headers: hdr });
      if (!res.ok) return null;
      const body = await res.json();
      if (Array.isArray(body) && body.length > 0) {
        return body.find((l) => l.is_active !== false) || body[0];
      }
      return null;
    } catch {
      return null;
    }
  }

  const license = (await tryPath('/license/')) || (await tryPath('/license/mine'));
  if (!license) {
    throw new Error('No active license found for this cafe. Contact your administrator.');
  }
  return license;
}

async function registerDevice(baseUrl, token, pcName, licenseKey, fingerprint) {
  const res = await fetch(`${baseUrl}/api/clientpc/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: pcName,
      license_key: licenseKey,
      hardware_fingerprint: fingerprint,
      capabilities: {
        os: 'windows',
        version: '1.0.0',
        features: ['lock', 'unlock', 'message', 'screenshot'],
      },
    }),
  });
  if (!res.ok) throw await parseErr(res, 'Device registration failed');
  return res.json();
}

/**
 * @param {string} adminEmail
 * @param {string} adminPassword
 * @param {string} pcName
 * @returns {Promise<HandshakeResult>}
 */
export async function performHandshake(adminEmail, adminPassword, pcName) {
  const baseUrl = getApiBase();

  const token = await adminLogin(baseUrl, adminEmail, adminPassword);

  const fingerprint = await invoke('generate_hardware_fingerprint');
  if (!fingerprint || typeof fingerprint !== 'string') {
    throw new Error('Failed to generate hardware fingerprint.');
  }

  const license = await fetchLicense(baseUrl, token);
  const pcData = await registerDevice(baseUrl, token, pcName, license.key, fingerprint);

  await invoke('save_device_credentials', {
    pcId: Number(pcData.id),
    licenseKey: String(license.key),
    deviceSecret: String(pcData.device_secret || ''),
  });

  // Mirror the license key into web-side storage so api/client.js can
  // attach X-License-Key on every backend request. Without this, customers
  // signing up at the kiosk get cafe_id=null and never see the cafe's
  // time packs (Bug 14).
  setLicenseKey(license.key);

  return {
    pc_id: pcData.id,
    license_key: license.key,
    cafe_id: pcData.cafe_id,
    name: pcData.name,
  };
}

/**
 * Check whether this device already has credentials saved by the native host.
 * Mirrors the license key into web-side storage so existing kiosks (already
 * paired before this change) get X-License-Key attached on next page load.
 * @returns {Promise<{ pc_id: number, license_key: string } | null>}
 */
export async function readDeviceCredentials() {
  try {
    const creds = await invoke('get_device_credentials');
    if (creds && creds.pc_id) {
      if (creds.license_key) setLicenseKey(creds.license_key);
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}
