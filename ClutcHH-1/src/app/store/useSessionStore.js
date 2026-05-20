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
      // Wall-clock timestamp (ms since epoch) when the current user signed
      // in on this kiosk. Used by PageHeader's session counter to display
      // elapsed time since login. Cleared on sign-out; populated on signIn
      // and on refreshMe when the user transitions from null → present.
      // TECH_DEBT #24: source this from a backend session record so the
      // counter survives a kiosk reload and reflects real session time.
      sessionStartedAt: null,
      // Customer-chosen avatar URL — written by the Appearance page,
      // rendered by AppHeader's top-right circle and the Rewards
      // profile card. Falls back to initials when null.
      // TECH_DEBT #27: should persist server-side (users.avatar_url)
      // so a customer's chosen avatar follows them across kiosks.
      avatar: null,
      loading: false,
      error: null,

      async signIn({ email, password }) {
        // Clear any previously-persisted user BEFORE we hit the wire, so
        // that if login fails we don't keep showing the old identity.
        set({ user: null, isAuthenticated: false, sessionStartedAt: null, loading: true, error: null });
        try {
          const user = await authService.signIn({ email, password });
          set({ user, isAuthenticated: true, sessionStartedAt: Date.now(), loading: false, error: null });
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
        set({
          user: null,
          isAuthenticated: false,
          sessionStartedAt: null,
          avatar: null,
          error: null,
        });
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
            // Only set sessionStartedAt if we don't already have one — a
            // page reload during an active session shouldn't reset the
            // timer to 0. (The persisted blob carries it through reload.)
            const current = get();
            set({
              user,
              isAuthenticated: true,
              sessionStartedAt: current.sessionStartedAt || Date.now(),
            });
          } else {
            // /auth/me returned null → JWT is gone or rejected. Drop the
            // cached identity so the UI stops showing a stale email.
            set({ user: null, isAuthenticated: false, sessionStartedAt: null });
          }
          return user;
        } catch {
          return get().user;
        }
      },

      setUser: (user) => {
        const current = get();
        set({
          user,
          isAuthenticated: !!user,
          sessionStartedAt: user ? (current.sessionStartedAt || Date.now()) : null,
        });
      },
      setAvatar: (avatar) => set({ avatar: avatar || null }),
      clearError: () => set({ error: null }),
    }),
    {
      name: STORAGE_KEYS.session,
      partialize: (s) => ({
        user: s.user,
        isAuthenticated: s.isAuthenticated,
        sessionStartedAt: s.sessionStartedAt,
        avatar: s.avatar,
      }),
    },
  ),
);

export default useSessionStore;
