/**
 * Authentication service — backed by the real Primus FastAPI backend.
 *
 * Keeps the same `authService` namespace the rest of the app imports, but
 * every method now goes to the wire. No more in-memory mocks.
 *
 * Endpoints:
 *   POST /api/v1/auth/login            — form-encoded username/password
 *   GET  /api/v1/auth/me               — current user
 *   POST /api/v1/auth/logout
 *   POST /api/v1/auth/password/forgot
 *   POST /api/v1/auth/register         — for sign-up flows
 */

import { api, apiGet, apiPost } from '@/app/api/client';
import { setJwt } from '@/app/bridge/config';
import { DEFAULT_USER } from '../constants';

function normalizeUser(u) {
  if (!u) return null;
  const name = u.full_name || u.name || (u.email ? u.email.split('@')[0] : DEFAULT_USER.name);
  const avatar =
    u.avatar ||
    (name || 'U')
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  return {
    id: u.id,
    name,
    email: u.email || '',
    role: u.role || 'user',
    // Surface cafe_id so the kiosk can reject sign-ins from accounts
    // that aren't bound to any cafe. Backend includes it on /auth/me
    // and on the /auth/login response itself; we prefer the former
    // because it's the canonical source after a token refresh.
    cafe_id: u.cafe_id ?? null,
    avatar,
    fullName: u.full_name || null,
    raw: u,
  };
}

export const authService = {
  async signIn({ email, password }) {
    if (!email || !password) throw new Error('Email and password are required.');

    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);

    const res = await api('/api/v1/auth/login', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const token = res?.access_token;
    if (!token) throw new Error('Login did not return an access token.');
    setJwt(token);

    const me = await apiGet('/api/v1/auth/me').catch(() => null);
    // Merge /me's user fields with the login response's RESOLVED cafe_id.
    // Why: /auth/me returns only `User.cafe_id` (the direct column on the
    // global users table), which is NULL for customers added to a cafe
    // via the many-to-many `UserCafeMap`. The login endpoint already
    // resolves cafe_id via device → UserCafeMap → User.cafe_id fallback,
    // so its response carries the authoritative value. Without this
    // merge, every UserCafeMap-bound customer hits the kiosk's
    // "not registered with this cafe" check and gets auto-redirected to
    // admin setup even though they're correctly bound in the DB.
    const merged = me
      ? { ...me, cafe_id: res?.cafe_id ?? me.cafe_id, role: me.role || res?.role }
      : { email, role: res?.role, cafe_id: res?.cafe_id };
    return normalizeUser(merged);
  },

  async signOut() {
    try {
      await apiPost('/api/v1/auth/logout');
    } catch {
      /* ignore — we still clear the local token */
    }
    setJwt(null);
    return true;
  },

  async me() {
    return normalizeUser(await apiGet('/api/v1/auth/me'));
  },

  async requestReset(email) {
    if (!email) throw new Error('Email required');
    // Backend (POST /api/v1/auth/password/forgot) emails a 6-digit OTP.
    // Always returns {ok: true} so callers can't enumerate accounts.
    await apiPost('/api/v1/auth/password/forgot', { email });
    return { email, sent: true };
  },

  async resetPassword({ email, otp, newPassword }) {
    // Backend switched from token-link to 6-digit OTP in commit 95f2e27.
    // ResetPasswordIn now requires {email, otp, new_password} — sending the
    // old {token, new_password} shape gets a 422 / "Invalid or expired code".
    if (!email) throw new Error('Email is required');
    if (!otp) throw new Error('Enter the 6-digit code from your email');
    if (!newPassword) throw new Error('New password is required');
    await apiPost('/api/v1/auth/password/reset', {
      email: String(email).trim(),
      otp: String(otp).trim(),
      new_password: newPassword,
    });
    return { ok: true };
  },

  async signUp({ username, firstName, lastName, email, password, dob, phone }) {
    if (!email || !password) throw new Error('Email and password are required.');

    // IMPORTANT: the backend /register endpoint mixes a pydantic body with
    // FastAPI `Form(...)` params in its signature. FastAPI treats any such
    // endpoint as form-encoded and silently sets `body=None` when JSON is
    // sent — which surfaces as "Name, email and password are required".
    // Send x-www-form-urlencoded so the Form(...) params populate.
    const form = new URLSearchParams();
    form.append(
      'name',
      [firstName, lastName].filter(Boolean).join(' ') || username || email.split('@')[0],
    );
    form.append('email', email);
    form.append('password', password);
    if (firstName) form.append('first_name', firstName);
    if (lastName) form.append('last_name', lastName);
    if (phone) form.append('phone', phone);
    if (dob) form.append('dob', dob); // backend maps dob → birthdate
    form.append('tos_accepted', 'true');

    const created = await api('/api/v1/auth/register', {
      method: 'POST',
      body: form,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return normalizeUser(created);
  },

  // --- OTP (email verification at signup) -----------------------------
  // The backend exposes /api/send-otp/ and /api/verify-otp/ — see
  // backend/app/main.py otp_router. Both are CSRF-exempt.

  async sendOtp(email) {
    const trimmed = (email || '').trim();
    if (!trimmed) throw new Error('Email is required to send OTP.');
    return apiPost('/api/send-otp/', { email: trimmed });
  },

  async verifyOtp(email, code) {
    const trimmed = (email || '').trim();
    if (!trimmed) throw new Error('Email is required.');
    if (!code) throw new Error('Enter the OTP you received.');
    return apiPost('/api/verify-otp/', { email: trimmed, otp: String(code) });
  },
};

export default authService;
