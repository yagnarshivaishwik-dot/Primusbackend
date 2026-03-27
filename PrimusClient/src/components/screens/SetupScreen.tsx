import React, { useState } from 'react';
import { performHandshake } from '../../services/handshake';
import { commandService } from '../../services/commandService';
// @ts-ignore - JS file without type declarations
import { getApiBase, setApiBase, presetApiBases } from '../../utils/api';

const SetupScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [pcName, setPcName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [apiBase, setApiBaseState] = useState(getApiBase());

    const handleSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            console.log("Starting handshake...");
            await performHandshake(adminEmail, adminPassword, pcName);
            console.log("Handshake successful, starting services...");
            await commandService.start();
            onComplete();
        } catch (err: any) {
            console.error("Setup failed", err);
            setError(err.response?.data?.detail || err.message || "Onboarding failed. Check credentials/network.");
        } finally {
            setLoading(false);
        }
    };

    const handleApiBaseChange = (value: string) => {
        setApiBase(value);
        setApiBaseState(getApiBase());
    };

    const handleCustomUrl = () => {
        const v = prompt('Enter Backend URL:', getApiBase());
        if (v) {
            setApiBase(v);
            setApiBaseState(getApiBase());
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans">
            <div className="max-w-md w-full bg-[#1e293b] rounded-3xl shadow-2xl p-10 border border-slate-700/50">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600/20 rounded-2xl mb-4">
                        <span className="text-3xl">🚀</span>
                    </div>
                    <h1 className="text-3xl font-extrabold text-white mb-2 italic tracking-tight">PRIMUS</h1>
                    <p className="text-slate-400">Initial Device Setup & Onboarding</p>
                </div>

                {/* Backend Server Switcher */}
                <div className="text-xs text-slate-400 mb-6 flex items-center gap-2 justify-center flex-wrap">
                    <span>Server:</span>
                    <select
                        value={apiBase}
                        onChange={(e) => handleApiBaseChange(e.target.value)}
                        className="bg-slate-900/50 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                    >
                        {presetApiBases().map((b: string) => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="underline text-indigo-400 hover:text-indigo-300"
                        onClick={handleCustomUrl}
                    >
                        Custom
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm flex items-start gap-3">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleSetup} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Admin Email</label>
                        <input
                            type="email"
                            required
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder="owner@yourcafe.com"
                            value={adminEmail}
                            onChange={(e) => setAdminEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Admin Password</label>
                        <input
                            type="password"
                            required
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600"
                            placeholder="••••••••"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                        />
                    </div>

                    <div className="pt-2 border-t border-slate-700/50">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 mt-4 ml-1">PC Name (Display Only)</label>
                        <input
                            type="text"
                            required
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600 font-mono"
                            placeholder="e.g. VIP-PC-01"
                            value={pcName}
                            onChange={(e) => setPcName(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 mt-4 uppercase tracking-widest text-sm"
                    >
                        {loading ? 'Completing Handshake...' : 'Register Device'}
                    </button>
                </form>

                <p className="mt-8 text-center text-[11px] text-slate-500 uppercase tracking-tighter">
                    Hardware fingerprint will be generated automatically.
                </p>
            </div>
        </div>
    );
};

export default SetupScreen;

