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
