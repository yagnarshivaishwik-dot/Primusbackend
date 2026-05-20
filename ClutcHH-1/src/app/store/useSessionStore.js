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
        // Also clear `avatar` so customer B doesn't inherit customer A's
        // chosen avatar after a fresh kiosk launch on a shared PC. The
        // avatar still persists across the SAME customer's reloads (it
        // sits in localStorage), but a new sign-in resets it back to the
        // initials fallback so each customer starts blank in Appearance.
        set({ user: null, isAuthenticated: false, sessionStartedAt: null, avatar: null, loading: true, error: null });
        try {
          const user = await authService.signIn({ email, password });

          // Reject sign-ins from accounts that aren't bound to a cafe.
          // The kiosk is itself tied to a specific cafe via the device
          // handshake, so a JWT without a cafe_id can't transact against
          // any cafe-scoped endpoint (shop, claims, prizes…). Better to
          // kick the user back to the login screen with a clear error
          // than to let them in and have every subsequent call 4xx.
          // Per the product requirement: anyone signing in without an
          // admin binding is redirected to admin login.
          if (!user || user.cafe_id == null) {
            try { await authService.signOut(); } catch { /* ignore */ }
            set({ user: null, isAuthenticated: false, sessionStartedAt: null, loading: false });
            throw new Error(
              "Your account isn't registered with this cafe. Please ask the cafe admin to add you, or sign in with an admin account."
            );
          }

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
      // Persistence policy for cafe-kiosk use:
      //   * `user` and `isAuthenticated` are INTENTIONALLY NOT PERSISTED.
      //     Each kiosk launch should land on the login screen regardless
      //     of who used the PC last — otherwise a fresh install on a
      //     machine with old localStorage rehydrates the previous
      //     customer's identity and they appear "logged in" without ever
      //     entering credentials. The auto-relaunch / WebView2 crash
      //     recovery cases are rare and acceptable trade-off: a customer
      //     mid-session who hits a reload just re-logs in, their wallet
      //     and progress are server-side anyway.
      //   * `sessionStartedAt` follows the same rule — meaningless
      //     without a user, and shouldn't carry a stale timestamp into
      //     the next customer's session.
      //   * `avatar` IS persisted because it's a per-PC appearance
      //     preference, not auth state. Cleared in signOut() so it
      //     can't bleed between users on a shared kiosk.
      partialize: (s) => ({
        avatar: s.avatar,
      }),
    },
  ),
);

export default useSessionStore;
