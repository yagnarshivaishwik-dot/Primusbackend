// TEMPORARY: ENABLE_MANUAL_PAYMENT — cash flow with admin confirmation.
// Gated on a build-time feature flag and matched by the backend's
// ENABLE_MANUAL_PAYMENT env var. Remove this file + the matching
// PaymentMethodChooser/CashAdminConfirmModal imports in ShopPage once
// Cashfree's embedded checkout flow clears the whitelist.

import { apiPost } from '@/app/api/client';

/**
 * Credit packs to the current customer after a cafe admin confirms cash
 * was received in person.
 *
 * @param {{
 *   adminEmail: string,
 *   adminPassword: string,
 *   packs: Array<{ id: number|string, qty: number }>,
 *   note?: string,
 * }} params
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   credited: Array<{ pack_id: number, pack_name: string, minutes_per: number, qty: number, user_offer_ids: number[] }>,
 *   total_minutes: number,
 *   user_offer_ids: number[],
 * }>}
 */
export function cashAdminCredit({ adminEmail, adminPassword, packs, note }) {
  if (!adminEmail || !adminPassword) {
    return Promise.reject(new Error('Admin email and password are required.'));
  }
  if (!Array.isArray(packs) || packs.length === 0) {
    return Promise.reject(new Error('No packs selected.'));
  }
  return apiPost('/api/v1/payment/cash/admin-credit', {
    admin_email: adminEmail,
    admin_password: adminPassword,
    packs: packs.map((p) => ({ id: Number(p.id), qty: Number(p.qty || 1) })),
    note: note || null,
  });
}

/**
 * Build-time feature flag read. Defaults to true so the India launch
 * works out of the box. Matches the backend's ENABLE_MANUAL_PAYMENT env
 * var — keep both in sync.
 */
export function manualPaymentEnabled() {
  const raw = import.meta.env.VITE_ENABLE_MANUAL_PAYMENT;
  if (raw === undefined || raw === null || raw === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
