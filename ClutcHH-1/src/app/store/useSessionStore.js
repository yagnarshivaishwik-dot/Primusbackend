/**
 * Session store — authoritative for the signed-in user.
 *
 * `signIn({ email, password })` clears any prior persisted user first, then
 * hits the backend. This prevents a stale profile (old email/avatar) from
 * being shown after signing in as a different user. The new normalised
 * user is persisted via zustand's `persist` middleware.
 *
 * Wallet balances live in useWalletStore — driven by
 * /api/v1/wallet/balance + realtime events, not by this store.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '@/constants/app';
import { authService } from '@/features/auth/services/authService';

const useSessionStore = create(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,

      async signIn({ email, password }) {
        // Clear any previously-persisted user BEFORE we hit the wire, so
        // that if login fails we don't keep showing the old identity.
        set({ user: null, isAuthenticated: false, loading: true, error: null });
        try {
          const user = await authService.signIn({ email, password });
          set({ user, isAuthenticated: true, loading: false, error: null });
          return user;
        } catch (err) {
          const message = err?.message || 'Sign in failed';
          set({ loading: false, error: message });
          throw err;
        }
      },

      async signOut() {
        try {
          await authService.signOut();
        } catch {
          /* ignore */
        }
        // Wipe both in-memory state AND the persisted blob so a refresh
        // can't rehydrate the signed-out identity.
        set({ user: null, isAuthenticated: false, error: null });
        try {
          useSessionStore.persist.clearStorage();
        } catch {
          /* older zustand versions — no-op */
        }
      },

      async refreshMe() {
        try {
          const user = await authService.me();
          if (user) {
            set({ user, isAuthenticated: true });
          } else {
            // /auth/me returned null → JWT is gone or rejected. Drop the
            // cached identity so the UI stops showing a stale email.
            set({ user: null, isAuthenticated: false });
          }
          return user;
        } catch {
          return get().user;
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      clearError: () => set({ error: null }),
    }),
    {
      name: STORAGE_KEYS.session,
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
    },
  ),
);

export default useSessionStore;
