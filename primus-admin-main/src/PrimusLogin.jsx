import React, { useState } from "react";
import axios from "axios";
import { getApiBase, setApiBase } from "./utils/api";

export default function PrimusLogin({ onLogin, allowedRoles }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizeError = (err) => {
    const d = err?.response?.data;
    const detail = d?.detail ?? d;
    if (Array.isArray(detail)) return detail.map(x => (x?.msg || String(x))).join("; ");
    if (typeof detail === "object" && detail) return detail.msg || detail.error || JSON.stringify(detail);
    return detail || err?.message || "Login failed";
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = getApiBase().replace(/\/$/, "") + "/api/auth/login";
      const params = new URLSearchParams();
      params.append("username", username);
      params.append("password", password);
      const res = await axios.post(url, params, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 });
      const token = res?.data?.access_token;
      if (!token) throw new Error("Invalid response from server");
      localStorage.setItem("primus_jwt", token);
      // Optional role enforcement
      if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
        try {
          const me = await axios.get(getApiBase().replace(/\/$/, "") + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
          const role = me?.data?.role;
          if (!allowedRoles.includes(String(role))) {
            localStorage.removeItem("primus_jwt");
            throw new Error("Not authorized for admin portal");
          }
        } catch (e) {
          throw e;
        }
      }
      if (typeof onLogin === "function") onLogin(token);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: 'radial-gradient(1200px 800px at 10% -10%, rgba(32,178,170,0.08), transparent 60%), radial-gradient(900px 700px at 100% 0%, rgba(32,178,170,0.06), transparent 60%), linear-gradient(0deg, rgba(11,12,16,1), rgba(11,12,16,1))'
    }}>
      <div className="glass-card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="#20B2AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">PRIMUS</h1>
          <p className="text-gray-400 text-sm">Admin Login</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="text-xs text-gray-400 -mt-2 mb-1">
            Server: <span className="text-primary">{getApiBase()}</span>
            <button type="button" className="ml-2 underline text-primary" onClick={() => {
              const base = window.prompt("Set backend URL", getApiBase());
              if (base) setApiBase(base);
            }}>Change</button>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Username</label>
            <div className="flex items-center bg-transparent border border-white/20 rounded-lg focus-within:ring-2 focus-within:ring-primary/60">
              <span className="px-3 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 10a4 4 0 100-8 4 4 0 000 8z"/><path fillRule="evenodd" d="M.458 16.042A10 10 0 1119.542 16.042a8 8 0 10-19.084 0z" clipRule="evenodd"/></svg>
              </span>
              <input type="text" value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username or email" className="flex-1 px-3 py-3 bg-transparent outline-none text-white placeholder-gray-400" required />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Password</label>
            <div className="flex items-center bg-transparent border border-white/20 rounded-lg focus-within:ring-2 focus-within:ring-primary/60">
              <span className="px-3 text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
              </span>
              <input type={showPassword?"text":"password"} value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Password" className="flex-1 px-3 py-3 bg-transparent outline-none text-white placeholder-gray-400" required />
              <button type="button" aria-label="Toggle password" onClick={()=>setShowPassword(s=>!s)} className="px-3 text-gray-400 hover:text-gray-200">
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M3.53 2.47a.75.75 0 10-1.06 1.06l18 18a.75.75 0 001.06-1.06l-2.261-2.261A12.338 12.338 0 0021.75 12S18 4.5 12 4.5a9.253 9.253 0 00-5.31 1.59L3.53 2.47zM12 7.5a4.5 4.5 0 014.5 4.5c0 .62-.128 1.208-.358 1.742l-5.384-5.384A4.47 4.47 0 0112 7.5z"/><path d="M3.75 12s3.75 7.5 9.75 7.5c1.496 0 2.857-.37 4.06-.99l-2.39-2.39A6 6 0 016 12c0-.735.132-1.439.375-2.088L3.75 12z"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M12 5.25C6 5.25 2.25 12 2.25 12s3.75 6.75 9.75 6.75S21.75 12 21.75 12 18 5.25 12 5.25zM12 15a3 3 0 110-6 3 3 0 010 6z"/></svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-sm">
              {typeof error === "string" ? error : JSON.stringify(error)}
            </div>
          )}

          <button type="submit" disabled={loading} className="w-full bg-primary/90 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}


