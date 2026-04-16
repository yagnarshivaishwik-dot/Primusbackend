// API Configuration
// Priority:
// 1. User-selected backend from localStorage (set by backend switcher UI)
// 2. Vite env variable (for build-time configuration)
// 3. Production default

function getStoredApiBase(): string | null {
  try {
    return localStorage.getItem('primus_api_base');
  } catch {
    return null;
  }
}

const API_URL =
  getStoredApiBase() ||
  import.meta.env.VITE_BACKEND_URL ||
  "https://api.primustech.in";

export default API_URL;

// Export a function for dynamic access (useful when URL changes at runtime)
export function getApiUrl(): string {
  return getStoredApiBase() ||
    import.meta.env.VITE_BACKEND_URL ||
    "https://api.primustech.in";
}
