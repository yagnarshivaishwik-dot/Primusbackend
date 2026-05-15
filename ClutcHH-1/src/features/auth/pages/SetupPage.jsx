import { useState } from 'react';
import { performHandshake } from '../services/handshakeService';
import { getApiBase, setApiBase, presetApiBases } from '@/app/bridge/config';

/**
 * One-time device-registration screen. Shown when the native host has no
 * saved device credentials. On success the caller re-mounts the app with
 * `deviceSetupState = 'ready'` and the normal auth flow takes over.
 *
 * Ported from PrimusClient SetupScreen.tsx; re-themed for ClutcHH.
 */
export default function SetupPage({ onComplete }) {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pcName, setPcName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiBaseValue, setApiBaseValue] = useState(getApiBase());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await performHandshake(adminEmail.trim(), adminPassword, pcName.trim());
      onComplete?.();
    } catch (err) {
      const msg =
        typeof err === 'string'
          ? err
          : err?.message || 'Device setup failed. Check credentials and network.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleApiBaseChange = (value) => {
    setApiBase(value);
    setApiBaseValue(getApiBase());
  };

  const handleCustomUrl = () => {
    // eslint-disable-next-line no-alert
    const v = window.prompt('Enter Backend URL:', getApiBase());
    if (v) {
      setApiBase(v);
      setApiBaseValue(getApiBase());
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0F14] flex items-center justify-center p-6 font-sans relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(circle at 20% 10%, rgba(58,190,255,0.18), transparent 50%),' +
            'radial-gradient(circle at 80% 90%, rgba(139,92,246,0.18), transparent 55%)',
        }}
      />

      <div className="relative max-w-md w-full bg-[#111823]/90 backdrop-blur-xl rounded-3xl shadow-2xl p-10 border border-white/5">
        <header className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-gradient-to-br from-[#3ABEFF] to-[#8B5CF6] shadow-lg shadow-[#3ABEFF]/20">
            <span className="text-2xl" aria-hidden="true">
              ⚡
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">CLUTCHH</h1>
          <p className="text-slate-400 mt-1 text-sm">Initial device setup &amp; onboarding</p>
        </header>

        <div className="text-[11px] text-slate-400 mb-6 flex items-center gap-2 justify-center flex-wrap">
          <span className="uppercase tracking-widest">Server</span>
          <select
            aria-label="Backend server"
            value={apiBaseValue}
            onChange={(e) => handleApiBaseChange(e.target.value)}
            className="bg-slate-900/70 border border-white/5 rounded px-2 py-1 text-slate-200"
          >
            {presetApiBases().map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="underline text-[#3ABEFF] hover:text-[#6DD1FF]"
            onClick={handleCustomUrl}
          >
            Custom
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-xl mb-5 text-sm flex items-start gap-3"
          >
            <span aria-hidden="true">⚠️</span>
            <span className="break-words">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Admin Email
            </span>
            <input
              type="email"
              required
              autoComplete="username"
              className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-[#3ABEFF] focus:border-transparent outline-none transition-all"
              placeholder="owner@yourcafe.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Admin Password
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-[#3ABEFF] focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
            />
          </label>

          <label className="block pt-2 border-t border-white/5">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 mt-4">
              PC Name (display only)
            </span>
            <input
              type="text"
              required
              className="w-full bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:ring-2 focus:ring-[#3ABEFF] focus:border-transparent outline-none transition-all font-mono"
              placeholder="e.g. VIP-PC-01"
              value={pcName}
              onChange={(e) => setPcName(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#3ABEFF] to-[#8B5CF6] text-white font-bold py-4 rounded-xl shadow-lg shadow-[#3ABEFF]/30 hover:shadow-[#3ABEFF]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2 uppercase tracking-widest text-xs hover:-translate-y-[1px] active:translate-y-0"
          >
            {loading ? 'Completing handshake…' : 'Register Device'}
          </button>
        </form>

        <p className="mt-6 text-center text-[10px] text-slate-500 uppercase tracking-tight">
          Hardware fingerprint will be generated automatically.
        </p>
      </div>
    </div>
  );
}
