/**
 * Wallet store — the source of truth for the kiosk's live financial state
 * (coins, cash balance, session time remaining, active-package status).
 *
 * Populated by:
 *   • initial fetch from /api/v1/wallet/balance, /api/v1/billing/estimate-timeleft
 *     and /api/v1/billing/active-package
 *   • realtime pushes from the host (`wallet_updated`, `time_updated`)
 *
 * The `hasActivePackage` flag drives PackageGuard (Phase 1) — null while
 * the initial fetch is in flight (renders children optimistically), then
 * a definitive boolean once /active-package returns.
 */

import { create } from 'zustand';
import {
  getBalance,
  estimateTimeLeft,
  getActivePackage,
} from '@/features/wallet/services/walletService';

const useWalletStore = create((set, get) => ({
  balance: 0,
  coins: 0,
  minutesLeft: 0,
  // null = loading (PackageGuard renders children optimistically),
  // false = definitely no package (kick to Shop),
  // true = active package (no gating).
  hasActivePackage: null,
  loaded: false,

  hydrate: async ({ pcId } = {}) => {
    try {
      const [b, t, pkg] = await Promise.all([
        getBalance().catch(() => null),
        pcId ? estimateTimeLeft(pcId).catch(() => null) : Promise.resolve(null),
        getActivePackage().catch(() => null),
      ]);
      set({
        balance: b?.balance ?? get().balance,
        coins: b?.coins ?? get().coins,
        // estimate-timeleft is offers + wallet/rate; active-package is
        // offer-only. The visible "minutes left" pill uses the
        // offer-only figure so it tracks paywall semantics (when
        // minutesLeft hits 0, the gate slams shut), not the wallet-
        // implied figure which can be misleading if rates change.
        minutesLeft: pkg?.minutes_remaining ?? t?.minutes ?? get().minutesLeft,
        hasActivePackage: pkg?.has_active ?? get().hasActivePackage,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  /**
   * Refresh active-package standalone — called from the WS time_updated
   * handler, from PackageGuard's 30 s poll fallback, and after a cash
   * credit success in CashAdminConfirmModal.
   */
  refreshActivePackage: async () => {
    try {
      const pkg = await getActivePackage();
      set({
        hasActivePackage: pkg?.has_active ?? false,
        minutesLeft: pkg?.minutes_remaining ?? get().minutesLeft,
      });
      return pkg;
    } catch {
      return null;
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
    // Any time event almost always means the package state changed
    // (purchase credit, consumption, expiry). Trigger an active-package
    // refresh so the PackageGuard reacts without waiting for its 30 s
    // poll. Fire-and-forget — the poll fallback covers any failure.
    try {
      get().refreshActivePackage?.();
    } catch { /* ignore */ }
  },

  /**
   * Local 1-minute tick driven by the countdown pill component.
   * Server reconciles via refreshActivePackage on every WS event +
   * every 30 s polling cycle, so drift stays bounded.
   */
  tickDown: () => {
    const cur = get().minutesLeft;
    const next = Math.max(0, cur - 1);
    if (next !== cur) set({ minutesLeft: next });
  },
}));

export default useWalletStore;
