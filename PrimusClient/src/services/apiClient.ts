import axios, { AxiosInstance, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config/api';

// Create axios instance with a placeholder baseURL
// The actual URL is set dynamically in the request interceptor
export const apiClient: AxiosInstance = axios.create({
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  async (config) => {
    // IMPORTANT: Set baseURL dynamically on each request
    // This ensures the URL selected in the backend switcher is used
    const baseUrl = getApiUrl();
    config.baseURL = baseUrl + '/api';

    // Add timestamp to prevent caching
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }

    // Authorization is now handled via HttpOnly cookies automatically by the browser.
    // We no longer read/send the token manually from localStorage.

    // SECURITY: Sign device-specific endpoints (heartbeat, etc.)
    // Only applies if running in Tauri context
    if ((config.url?.includes('/client_pc/heartbeat') || config.url?.includes('/client_pc/register'))) {
      try {
        const { signRequest } = await import('../utils/signature');
        // This is async, so we must await it.
        // Axios interceptors support async return.
        const signedData = await signRequest(
          config.method?.toUpperCase() || 'GET',
          config.url || '',
          config.data
        );

        config.headers['X-Signature'] = signedData.signature;
        config.headers['X-Timestamp'] = signedData.timestamp.toString();
        // X-PC-ID might be needed if not already present, but backend requires it for get_current_device
        if (signedData.pcId) {
          config.headers['X-PC-ID'] = signedData.pcId.toString();
        }
      } catch (err) {
        console.warn("Failed to sign request (likely not in Tauri or invalid secret):", err);
        // We continue without signing; backend will reject if strict mode is on.
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 429 Rate Limited - DON'T retry, just show error
    if (error.response?.status === 429) {
      console.warn('Rate limited - please slow down requests');
      toast.error('Too many requests. Please wait a moment.');
      return Promise.reject(error);
    }

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const { useAuthStore } = await import('../stores/authStore');
        const refreshSuccess = await useAuthStore.getState().refreshToken();

        if (refreshSuccess) {
          // Retry the original request
          return apiClient(originalRequest);
        } else {
          // Refresh failed, logout user - but DON'T reload page
          await useAuthStore.getState().logout();
          // Let the app naturally show login screen via state change
        }
      } catch (refreshError) {
        // Refresh failed, logout user - but DON'T reload page
        const { useAuthStore } = await import('../stores/authStore');
        await useAuthStore.getState().logout();
        // Let the app naturally show login screen via state change
      }
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      // Only show toast if not already rate limited
      if (!originalRequest._networkErrorShown) {
        originalRequest._networkErrorShown = true;
        toast.error('Network error. Please check your connection.');
      }
    }

    // Handle server errors
    if (error.response?.status >= 500) {
      console.error('Server error:', error.response.status, error.response.data);
      toast.error('Server error. Please try again later.');
    }

    // Handle client errors (4xx) - but not 401 or 429
    if (error.response?.status >= 400 && error.response?.status < 500) {
      const message = error.response.data?.detail || error.response.data?.message || 'Request failed';
      console.error('Client error:', error.response.status, message);

      // Don't show toast for 401 or 429 errors (handled above)
      if (error.response.status !== 401 && error.response.status !== 429) {
        toast.error(message);
      }
    }

    return Promise.reject(error);
  }
);

// API service methods
export const apiService = {
  // Authentication
  auth: {
    login: (email: string, password: string) => {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);
      return apiClient.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    },
    register: (userData: any) => apiClient.post('/auth/register', userData),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
    refresh: (refreshToken: string) => apiClient.post('/auth/refresh', { refresh_token: refreshToken }),
  },

  // PC Management
  pc: {
    register: (pcData: any) => apiClient.post('/clientpc/register', pcData),
    status: (pcId: number) => apiClient.get(`/clientpc/${pcId}/status`),
    updateStatus: (pcId: number, status: string) => apiClient.patch(`/clientpc/${pcId}/status`, { status }),
    list: () => apiClient.get('/clientpc'),
  },

  // Session Management
  session: {
    start: (sessionData: any) => apiClient.post('/session/start', sessionData),
    // Backend endpoint: POST /api/session/stop/{session_id}
    end: (sessionId: number) => apiClient.post(`/session/stop/${sessionId}`),
    current: () => apiClient.get('/session/current'),
    history: (userId?: number) =>
      apiClient.get('/session/history', { params: { user_id: userId } }),
  },

  // Wallet Management
  wallet: {
    balance: (userId: number) => apiClient.get(`/wallet/balance/${userId}`),
    topup: (userId: number, amount: number) => apiClient.post('/wallet/topup', { user_id: userId, amount }),
    transactions: (userId: number) => apiClient.get(`/wallet/transactions/${userId}`),
  },

  // Games
  games: {
    list: () => apiClient.get('/games'),
    popular: () => apiClient.get('/games/popular'),
    search: (query: string) => apiClient.get('/games/search', { params: { q: query } }),
  },

  // Bookings
  bookings: {
    create: (bookingData: any) => apiClient.post('/booking', bookingData),
    list: (userId?: number) => apiClient.get('/booking', { params: { user_id: userId } }),
    cancel: (bookingId: number) => apiClient.delete(`/booking/${bookingId}`),
  },

  // Support
  support: {
    createTicket: (ticketData: any) => apiClient.post('/support', ticketData),
    listTickets: (userId?: number) => apiClient.get('/support', { params: { user_id: userId } }),
    updateTicket: (ticketId: number, updates: any) => apiClient.patch(`/support/${ticketId}`, updates),
  },

  // Notifications
  notifications: {
    list: (userId?: number) => apiClient.get('/notification', { params: { user_id: userId } }),
    markRead: (notificationId: number) => apiClient.patch(`/notification/${notificationId}/read`),
  },

  // Admin APIs
  admin: {
    users: {
      list: () => apiClient.get('/user'),
      create: (userData: any) => apiClient.post('/user', userData),
      update: (userId: number, userData: any) => apiClient.patch(`/user/${userId}`, userData),
      delete: (userId: number) => apiClient.delete(`/user/${userId}`),
    },
    pcs: {
      list: () => apiClient.get('/pc'),
      create: (pcData: any) => apiClient.post('/pc', pcData),
      update: (pcId: number, pcData: any) => apiClient.patch(`/pc/${pcId}`, pcData),
      delete: (pcId: number) => apiClient.delete(`/pc/${pcId}`),
      command: (pcId: number, command: string, params?: any) =>
        apiClient.post('/command', { pc_id: pcId, command, params }),
    },
    stats: {
      dashboard: () => apiClient.get('/stats/dashboard'),
      revenue: (startDate?: string, endDate?: string) =>
        apiClient.get('/stats/revenue', { params: { start_date: startDate, end_date: endDate } }),
      usage: () => apiClient.get('/stats/usage'),
    },
    settings: {
      get: () => apiClient.get('/settings'),
      update: (settings: any) => apiClient.post('/settings', settings),
    },
  },

  // System
  system: {
    health: () => apiClient.get('/health'),
    version: () => apiClient.get('/version'),
  },
};

export default apiService;
