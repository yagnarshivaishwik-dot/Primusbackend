import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
    (config) => {
        // Token is set directly in auth store, but we can also check localStorage as backup
        const stored = localStorage.getItem('primus-auth-storage');
        if (stored) {
            try {
                const { state } = JSON.parse(stored);
                if (state?.token && !config.headers['Authorization']) {
                    config.headers['Authorization'] = `Bearer ${state.token}`;
                }
            } catch (e) {
                console.error('Failed to parse auth storage:', e);
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for handling errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle 401 Unauthorized - redirect to login
        if (error.response?.status === 401) {
            // Clear stored auth and redirect
            localStorage.removeItem('primus-auth-storage');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        // Handle 403 Forbidden - permission denied
        if (error.response?.status === 403) {
            console.error('Permission denied:', error.response.data);
        }

        // Handle network errors
        if (!error.response) {
            console.error('Network error:', error.message);
        }

        return Promise.reject(error);
    }
);

export default api;
