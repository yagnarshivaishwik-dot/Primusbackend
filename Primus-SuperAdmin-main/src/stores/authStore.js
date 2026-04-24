import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/client';

// Permission constants
export const PERMISSIONS = {
    VIEW_CAFE_REGISTRY: 'view_cafe_registry',
    EDIT_CAFE_DETAILS: 'edit_cafe_details',
    VIEW_SUBSCRIPTIONS: 'view_subscriptions',
    MODIFY_PRICING: 'modify_pricing',
    VIEW_FINANCIAL_ANALYTICS: 'view_financial_analytics',
    EXPORT_REPORTS: 'export_reports',
    TRIGGER_INVOICES: 'trigger_invoices',
    SUSPEND_REACTIVATE_CAFES: 'suspend_reactivate_cafes',
    VIEW_PC_HEALTH: 'view_pc_health',
    REMOTE_PC_ACCESS: 'remote_pc_access',
    EXECUTE_PC_COMMANDS: 'execute_pc_commands',
    VIEW_AUDIT_LOGS: 'view_audit_logs',
    MANAGE_USERS: 'manage_users',
    MANAGE_PERMISSIONS: 'manage_permissions',
};

// All permissions for SuperAdmin
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Session timeout duration in milliseconds (5 minutes)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

const useAuthStore = create(
    persist(
        (set, get) => ({
            // State
            user: null,
            token: null,
            permissions: [],
            isAuthenticated: false,
            mustChangePassword: false,
            isLoading: false,
            error: null,
            lastActivity: null,

            // Actions
            login: async (username, password) => {
                set({ isLoading: true, error: null });

                try {
                    // Use internal auth endpoint designed for SuperAdmin portal
                    const response = await api.post('/internal/auth/login', {
                        username,
                        password,
                    });

                    const { access_token, user, must_change_password } = response.data;

                    // Set auth header for subsequent requests
                    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

                    // Set permissions from response or default based on role
                    const permissions = user.permissions?.length > 0
                        ? user.permissions
                        : (user.role === 'superadmin' ? ALL_PERMISSIONS : []);

                    set({
                        user: {
                            id: user.id,
                            username: user.name || user.email,
                            email: user.email,
                            role: user.role,
                            first_name: user.first_name,
                            last_name: user.last_name,
                        },
                        token: access_token,
                        permissions,
                        isAuthenticated: true,
                        mustChangePassword: must_change_password || false,
                        isLoading: false,
                        error: null,
                        lastActivity: Date.now(),
                    });

                    return { success: true, mustChangePassword: must_change_password };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail || 'Login failed. Please check your credentials.';
                    set({
                        isLoading: false,
                        error: errorMessage,
                    });
                    delete api.defaults.headers.common['Authorization'];
                    return { success: false, error: errorMessage };
                }
            },

            logout: () => {
                set({
                    user: null,
                    token: null,
                    permissions: [],
                    isAuthenticated: false,
                    mustChangePassword: false,
                    error: null,
                    lastActivity: null,
                });
                delete api.defaults.headers.common['Authorization'];
            },

            changePassword: async (currentPassword, newPassword) => {
                set({ isLoading: true, error: null });
                try {
                    await api.post('/internal/auth/change-password', {
                        current_password: currentPassword,
                        new_password: newPassword,
                    });

                    set({
                        mustChangePassword: false,
                        isLoading: false,
                        lastActivity: Date.now(),
                    });

                    return { success: true };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail || 'Password change failed';
                    set({
                        isLoading: false,
                        error: errorMessage,
                    });
                    return { success: false, error: errorMessage };
                }
            },

            // Update last activity timestamp
            updateActivity: () => {
                const { isAuthenticated } = get();
                if (isAuthenticated) {
                    set({ lastActivity: Date.now() });
                }
            },

            // Check if session has timed out (5 minutes of inactivity)
            checkSessionTimeout: () => {
                const { isAuthenticated, lastActivity, logout } = get();
                if (isAuthenticated && lastActivity) {
                    const now = Date.now();
                    const timeSinceActivity = now - lastActivity;
                    if (timeSinceActivity > SESSION_TIMEOUT_MS) {
                        console.log('Session timed out due to inactivity');
                        logout();
                        return true; // Session expired
                    }
                }
                return false; // Session valid
            },

            hasPermission: (permission) => {
                const { user, permissions } = get();
                // SuperAdmin has all permissions
                if (user?.role === 'superadmin') return true;
                return permissions.includes(permission);
            },

            hasAnyPermission: (permissionList) => {
                const { hasPermission } = get();
                return permissionList.some(p => hasPermission(p));
            },

            hasAllPermissions: (permissionList) => {
                const { hasPermission } = get();
                return permissionList.every(p => hasPermission(p));
            },

            isSuperAdmin: () => {
                const { user } = get();
                return user?.role === 'superadmin';
            },

            clearError: () => set({ error: null }),

            // Restore session on app load
            restoreSession: () => {
                const { token, isAuthenticated, checkSessionTimeout, updateActivity } = get();

                // Check if session has timed out
                if (isAuthenticated && checkSessionTimeout()) {
                    return false; // Session expired, user needs to re-login
                }

                if (token) {
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
                    updateActivity(); // Reset activity timer on session restore
                    return true; // Session restored
                }
                return false; // No session
            },
        }),
        {
            name: 'primus-auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                permissions: state.permissions,
                isAuthenticated: state.isAuthenticated,
                mustChangePassword: state.mustChangePassword,
                lastActivity: state.lastActivity,
            }),
        }
    )
);

export default useAuthStore;

