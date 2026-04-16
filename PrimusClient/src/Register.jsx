import React, { useState } from "react";
import axios from "axios";
import { getApiBase, setApiBase, csrfHeaders } from "./utils/api";

export default function Register({ goToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role] = useState("client");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiBaseShown, setApiBaseShown] = useState(getApiBase());

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      const url = getApiBase().replace(/\/$/, "") + "/api/auth/register";
      const params = new URLSearchParams();
      params.append('name', name);
      params.append('email', email);
      params.append('password', password);
      params.append('role', role);
      await axios.post(
        url,
        params,
        { timeout: 15000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...csrfHeaders() } }
      );
      setSuccess("Registration complete! You can now log in.");
      setTimeout(goToLogin, 1200);
    } catch (err) {
      const d = err?.response?.data; const detail = d?.detail ?? d;
      let msg = detail || err?.message || 'Registration failed';
      if (Array.isArray(detail)) msg = detail.map(x => (x?.msg || String(x))).join('; ');
      if (typeof detail === 'object' && detail) msg = detail.msg || detail.error || JSON.stringify(detail);
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{
      background: 'radial-gradient(1200px 800px at 10% -10%, rgba(32,178,170,0.08), transparent 60%), radial-gradient(900px 700px at 100% 0%, rgba(32,178,170,0.06), transparent 60%), linear-gradient(0deg, rgba(11,12,16,1), rgba(11,12,16,1))'
    }}>
      <div className="glass-card p-10 w-full max-w-md flex flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-primary drop-shadow-sm tracking-widest">
            Primus
          </h1>
          <p className="text-lg text-white/80 mt-2 font-light">
            Create your account
          </p>
        </div>
        <form className="w-full space-y-5" onSubmit={submit}>
          <div className="text-xs text-white/60 -mt-2">
            Server: <span className="text-primary">{apiBaseShown}</span>
            <button
              type="button"
              className="ml-2 underline text-primary font-bold"
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
          <input
            type="text"
            placeholder="Name"
            className="w-full glass-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <input
            type="email"
            placeholder="Email"
            className="w-full glass-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full glass-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 rounded-xl bg-primary hover:bg-primary text-white text-lg font-bold shadow-lg transition disabled:opacity-60"
          >
            {loading ? "Creating..." : "Register"}
          </button>
          {error && (
            <div className="bg-red-500/80 text-white text-center py-2 rounded-lg animate-pulse shadow-md">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-600/80 text-white text-center py-2 rounded-lg shadow-md">
              {success}
            </div>
          )}
        </form>
        <div className="text-white/80 mt-6 text-sm opacity-60">
          Already have an account?{" "}
          <button
            onClick={goToLogin}
            className="underline text-primary font-bold"
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
