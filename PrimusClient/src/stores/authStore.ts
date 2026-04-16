import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../services/apiClient';
import toast from 'react-hot-toast';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'client';
  cafe_id?: number;
  wallet_balance?: number;
  coins_balance?: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  login: (_email: string, _password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (_userData: RegisterData) => Promise<boolean>;
  initialize: () => Promise<void>;
  updateUser: (_userData: Partial<User>) => void;
  refreshToken: () => Promise<boolean>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (email: string, password: string): Promise<boolean> => {
        set({ isLoading: true });

        try {
          const formData = new FormData();
          formData.append('username', email);
          formData.append('password', password);

          const response = await apiClient.post<LoginResponse>('/auth/login', formData, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });

          const { access_token, user } = response.data;

          // Set authentication state
          // Token is now in HttpOnly cookie, so we don't store it in JS.
          // We set a flag or dummy value if needed by other components, 
          // but for security we should rely on the cookie presence (verified by /me)
          set({
            user,
            token: "cookie", // Dummy value to satisfy type check / isAuthenticated check
            isAuthenticated: true,
            isLoading: false,
          });

          // Configure API client with token
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

          toast.success(`Welcome back, ${user.name}!`);
          return true;
        } catch (error: any) {
          console.error('Login failed:', error);

          const message = error.response?.data?.detail || 'Login failed. Please check your credentials.';
          toast.error(message);

          set({ isLoading: false });
          return false;
        }
      },

      logout: async (): Promise<void> => {
        try {
          // Call logout endpoint if available
          if (get().token) {
            await apiClient.post('/auth/logout').catch(() => {
              // Ignore errors on logout endpoint
            });
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear authentication state
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });

          // Remove token from API client
          delete apiClient.defaults.headers.common['Authorization'];

          toast.success('Logged out successfully');
        }
      },

      register: async (userData: RegisterData): Promise<boolean> => {
        set({ isLoading: true });

        try {
          await apiClient.post('/auth/register', {
            ...userData,
            role: 'client', // Default role for self-registration
          });

          toast.success('Registration successful! Please log in.');
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          console.error('Registration failed:', error);

          const message = error.response?.data?.detail || 'Registration failed. Please try again.';
          toast.error(message);

          set({ isLoading: false });
          return false;
        }
      },

      initialize: async (): Promise<void> => {
        const { token } = get();

        if (!token) {
          set({ isLoading: false });
          return;
        }

        set({ isLoading: true });

        try {
          // Configure API client with stored token
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          // Verify token and get current user
          const response = await apiClient.get<User>('/auth/me');

          set({
            user: response.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          console.error('Token verification failed:', error);

          // Clear invalid token
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });

          delete apiClient.defaults.headers.common['Authorization'];
        }
      },

      updateUser: (userData: Partial<User>): void => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...userData } });
        }
      },

      refreshToken: async (): Promise<boolean> => {
        const { token } = get();

        if (!token) {
          return false;
        }

        try {
          const response = await apiClient.post<LoginResponse>('/auth/refresh', {
            refresh_token: token,
          });

          const { access_token, user } = response.data;

          set({
            user,
            token: access_token,
            isAuthenticated: true,
          });

          apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
          return true;
        } catch (error) {
          console.error('Token refresh failed:', error);

          // Clear invalid token
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });

          delete apiClient.defaults.headers.common['Authorization'];
          return false;
        }
      },
    }),
    {
      name: 'primus-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
