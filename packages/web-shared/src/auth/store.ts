import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Canonical auth store for the Primus web tier.
 *
 * Forensic audit BUG #28: the access token MUST NOT be persisted to
 * localStorage. It lives only in this zustand store's in-memory slot.
 * After a hard reload the consumer SPA calls `refreshToken()` which
 * exchanges the httpOnly refresh cookie for a fresh access token.
 *
 * What we persist: only the non-secret identity fields (`user`,
 * `permissions`, `lastActivity`) so the UI can render a logged-in
 * shell before refresh completes.
 */

export interface AuthUser {
  id: string | number;
  username?: string;
  email?: string;
  role?: string;
  first_name?: string;
  last_name?: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  lastActivity: number | null;

  setSession: (s: {
    user: AuthUser;
    token: string;
    permissions?: string[];
  }) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  updateActivity: () => void;
  hasPermission: (permission: string) => boolean;
}

const STORAGE_KEY = 'primus-auth-storage';

export const useSharedAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      permissions: [],
      isAuthenticated: false,
      lastActivity: null,

      setSession: ({ user, token, permissions = [] }) => {
        set({
          user,
          token,
          permissions,
          isAuthenticated: true,
          lastActivity: Date.now(),
        });
      },

      setToken: (token) => {
        set({ token, isAuthenticated: Boolean(token) });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          permissions: [],
          isAuthenticated: false,
          lastActivity: null,
        });
      },

      updateActivity: () => {
        if (get().isAuthenticated) {
          set({ lastActivity: Date.now() });
        }
      },

      hasPermission: (permission) => {
        const { user, permissions } = get();
        if (user?.role === 'superadmin') return true;
        return permissions.includes(permission);
      },
    }),
    {
      name: STORAGE_KEY,
      // BUG #28: token deliberately excluded.
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
        lastActivity: state.lastActivity,
      }),
    },
  ),
);
