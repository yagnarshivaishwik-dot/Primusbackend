/**
 * Wallet store — the source of truth for the kiosk's live financial state
 * (coins, cash balance, session time remaining). Populated by:
 *   • initial fetch from /api/v1/wallet/balance and /api/v1/billing/estimate-timeleft
 *   • realtime pushes from the host (`wallet_updated`, `time_updated`)
 */

import { create } from 'zustand';
import { getBalance, estimateTimeLeft } from '@/features/wallet/services/walletService';

const useWalletStore = create((set, get) => ({
  balance: 0,
  coins: 0,
  minutesLeft: 0,
  loaded: false,

  hydrate: async ({ pcId } = {}) => {
    try {
      const [b, t] = await Promise.all([
        getBalance().catch(() => null),
        pcId ? estimateTimeLeft(pcId).catch(() => null) : Promise.resolve(null),
      ]);
      set({
        balance: b?.balance ?? get().balance,
        coins: b?.coins ?? get().coins,
        minutesLeft: t?.minutes ?? get().minutesLeft,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  applyWalletEvent: (payload) => {
    if (!payload) return;
    set({
      balance: payload.balance ?? get().balance,
      coins: payload.coins ?? get().coins,
    });
  },

  applyTimeEvent: (payload) => {
    if (!payload) return;
    const secs = payload.remaining_seconds ?? payload.remainingSeconds;
    if (typeof secs === 'number') {
      set({ minutesLeft: Math.max(0, Math.floor(secs / 60)) });
    }
  },

  tickDown: () => {
    const next = Math.max(0, get().minutesLeft - 1);
    if (next !== get().minutesLeft) set({ minutesLeft: next });
  },
}));

export default useWalletStore;
