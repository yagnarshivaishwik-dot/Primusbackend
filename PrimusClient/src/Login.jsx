import React, { useEffect, useState } from "react";
import { getUserFromToken, isTokenValid } from "./utils/jwt";
import axios from "axios";
// Removed Firebase login; using backend OAuth and GIS in other UIs
import { getApiBase, setApiBase, csrfHeaders } from "./utils/api";

// Build login URL at submit time; avoid global mutation

export default function Login({ goToRegister, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiBaseShown, setApiBaseShown] = useState(getApiBase());

  useEffect(() => {
    // Show current backend; allow changing via button. No automatic prompt on mount (avoids blank screens)
    setApiBaseShown(getApiBase());
    // No Firebase: nothing to do on mount
  }, []);

  const normalizeError = (err) => {
    const d = err?.response?.data;
    const detail = d?.detail ?? d;
    if (Array.isArray(detail)) {
      return detail.map(x => (x?.msg || typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
    }
    if (typeof detail === 'object' && detail) {
      return detail.msg || detail.error || JSON.stringify(detail);
    }
    return detail || err?.message || 'Request failed';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const API_URL = getApiBase().replace(/\/$/, "") + "/api/auth/login";
      const params = new URLSearchParams();
      params.append("username", email);
      params.append("password", password);

      const res = await axios.post(
        API_URL,
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            ...csrfHeaders(),
          },
          timeout: 15000,
        }
      );

      // Store the token and call the onLogin callback with the token
      const token = res.data.access_token;
      localStorage.setItem("primus_jwt", token);
      // Ensure a pc name for identification (no license prompt in demo)
      let pcName = localStorage.getItem("primus_pc_name");
      if (!pcName) {
        const platform = (navigator?.userAgentData?.platform || navigator?.platform || 'PC');
        pcName = `${platform}-${Math.floor(Math.random()*10000)}`;
        localStorage.setItem("primus_pc_name", pcName);
      }
      onLogin(token); // This will trigger the App component to update user state
      
    } catch (err) {
      setError(normalizeError(err));
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    // No Firebase handler here. Google login is handled in Primus web client UI using GIS.
    setError("Google login not available in this client.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: 'radial-gradient(1200px 800px at 10% -10%, rgba(32,178,170,0.08), transparent 60%), radial-gradient(900px 700px at 100% 0%, rgba(32,178,170,0.06), transparent 60%), linear-gradient(0deg, rgba(11,12,16,1), rgba(11,12,16,1))'
    }}>
      <div className="glass-card p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="text-3xl font-bold text-white mb-2">PRIMUS</h1>
          <p className="text-gray-400">Ultra-fast Gaming Client Login</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6" autoComplete="off">
          <div className="text-xs text-gray-400 -mt-2 mb-2">
            Server: <span className="text-primary">{apiBaseShown}</span>
            <button
              type="button"
              className="ml-2 underline text-primary"
              onClick={() => {
                const base = window.prompt("Set backend URL", getApiBase());
                if (base) {
                  setApiBase(base);
                  setApiBaseShown(getApiBase());
                }
              }}
            >
              Change
            </button>
          </div>
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              autoComplete="new-email"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-transparent border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              autoComplete="new-password"
              placeholder="Enter your password"
              required
            />
          </div>

          {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm break-words">
            {typeof error === 'string' ? error : JSON.stringify(error)}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary/90 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sign In
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Signing In...
              </div>
            ) : (
              "Sign In"
            )}
          </button>

          {/* Social logins disabled */}
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-400">
            Don't have an account?{" "}
            <button
              onClick={goToRegister}
              className="text-primary hover:opacity-80 font-medium transition-colors"
            >
              Register here
            </button>
          </p>
        </div>
      </div>

      {/* Full-screen Loading Overlay */}
      {loading && (
        <div className="login-loading-overlay">
          <div className="login-spinner-container">
            <div className="login-spinner-glow"></div>
            <div className="login-spinner"></div>
          </div>
          <div className="login-loading-text">Signing In</div>
          <div className="login-loading-subtext">Please wait while we authenticate you...</div>
        </div>
      )}
    </div>
  );
}
