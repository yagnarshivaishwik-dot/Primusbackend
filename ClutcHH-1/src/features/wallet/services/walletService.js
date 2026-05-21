import { apiGet } from '@/app/api/client';

/**
 * GET /api/v1/wallet/balance  →  { balance, coins }
 */
export function getBalance() {
  return apiGet('/api/v1/wallet/balance');
}

/**
 * GET /api/v1/wallet/transactions  →  WalletTransactionOut[]
 */
export function listTransactions() {
  return apiGet('/api/v1/wallet/transactions');
}

/**
 * GET /api/v1/billing/estimate-timeleft?pc_id=X  →  { minutes }
 */
export function estimateTimeLeft(pcId) {
  if (!pcId) return Promise.resolve({ minutes: 0 });
  return apiGet('/api/v1/billing/estimate-timeleft', { pc_id: pcId });
}

/**
 * GET /api/v1/billing/active-package
 *   → { has_active, minutes_remaining, package_count }
 *
 * Used by PackageGuard (Phase 1 — block non-Shop routes when has_active
 * is false) and by the countdown pill (Phase 2 — reconcile against
 * server time every 30 s on top of the local minute-tick).
 */
export function getActivePackage() {
  return apiGet('/api/v1/billing/active-package');
}
