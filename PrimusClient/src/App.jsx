import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from 'react-router-dom';
import AuthCombined from "./login-and-register";
import { getUserFromToken, isTokenValid } from "./utils/jwt";
import { getApiBase, authHeaders, flushQueue, showToast, csrfHeaders } from "./utils/api";
import axios from "axios";

// Import Tauri API for kiosk functionality
import { invoke } from './utils/invoke';

// Import SetupScreen for device registration
import SetupScreen from './components/screens/SetupScreen';

// Import new UI components
import Header from './components/ui/Header';
import HomePage from './pages/HomePage';
import GamesPage from './pages/GamesPage';
import ArcadePage from './pages/ArcadePage';
import AppsPage from './pages/AppsPage';
import ShopPage from './pages/ShopPage';
import VaultPage from './pages/VaultPage';
import AccountPage from './pages/AccountPage';
import PCSettingsPage from './pages/PCSettingsPage';

import './App.css';

const API_BASE = getApiBase();

export default function App() {
    const [showRegister, setShowRegister] = useState(false);
    const [jwt, setJwt] = useState(localStorage.getItem("primus_jwt"));
    const [currentUser, setCurrentUser] = useState(null);
    const [pcId, setPcId] = useState(null);
    const [locked, setLocked] = useState(false);
    const [nextBooking, setNextBooking] = useState(null);
    const [networkOnline, setNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    // User balance data
    const [minutesLeft, setMinutesLeft] = useState(0);
    const [cashBalance, setCashBalance] = useState(0);
    const [ggCoins, setGgCoins] = useState(0);

    // Device setup state - 'loading' | 'setup-required' | 'ready'
    const [deviceSetupState, setDeviceSetupState] = useState('loading');

    // Check device credentials on mount
    useEffect(() => {
        const checkDeviceSetup = async () => {
            try {
                console.log('[Primus] Checking device credentials...');
                const creds = await invoke("get_device_credentials");
                console.log('[Primus] Device credentials response:', creds);

                if (creds && creds.pc_id) {
                    console.log('[Primus] Device registered, proceeding to app');
                    setPcId(creds.pc_id);
                    setDeviceSetupState('ready');
                } else {
                    console.log('[Primus] No device credentials - showing SetupScreen');
                    setDeviceSetupState('setup-required');
                }
            } catch (e) {
                console.error('[Primus] Failed to check device credentials', e);
                setDeviceSetupState('setup-required');
            }
        };
        checkDeviceSetup();
    }, []);

    // Check token validity and get user info
    useEffect(() => {
        if (jwt && jwt !== "dummy_token_for_demo") {
            const fetchMe = async () => {
                try {
                    const res = await axios.get(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
                    setCurrentUser(res.data);
                } catch {
                    const fallback = getUserFromToken();
                    if (fallback) setCurrentUser(fallback);
                    else setCurrentUser(null);
                }
            };
            fetchMe();
        } else {
            setCurrentUser(null);
        }
    }, [jwt]);

    // Fetch user balance data
    useEffect(() => {
        if (!currentUser || !pcId) return;

        const fetchBalances = async () => {
            try {
                // Get time remaining
                const timeRes = await axios.get(`${getApiBase()}/api/billing/estimate-timeleft`, {
                    params: { pc_id: pcId, _t: Date.now() },
                    headers: authHeaders()
                });
                setMinutesLeft(timeRes.data?.minutes ?? 0);
            } catch (e) {
                console.warn('[Primus] Failed to fetch time:', e);
            }

            try {
                // Get wallet balance and coins (consolidated endpoint)
                const balanceRes = await axios.get(`${getApiBase()}/api/wallet/balance`, {
                    params: { _t: Date.now() },
                    headers: authHeaders()
                });
                setCashBalance(balanceRes.data?.balance ?? 0);
                setGgCoins(balanceRes.data?.coins ?? 0);
            } catch (e) {
                console.warn('[Primus] Failed to fetch balance/coins:', e);
            }
        };

        fetchBalances();
        const interval = setInterval(fetchBalances, 20000); // Refresh every 20s for faster time sync
        return () => clearInterval(interval);
    }, [currentUser, pcId]);

    // Network status and kiosk initialization
    useEffect(() => {
        const onOnline = () => setNetworkOnline(true);
        const onOffline = () => setNetworkOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        const initializeKiosk = async () => {
            try {
                console.log('Testing backend connection...');
                const apiBase = getApiBase();

                try {
                    await axios.get(`${apiBase}/health`);
                    console.log('Backend connection successful');
                } catch (connectionError) {
                    console.warn('Backend not reachable:', connectionError.message);
                }

                try {
                    await invoke('register_pc_with_backend');
                    console.log('PC registered with backend');
                } catch (regError) {
                    console.warn('PC registration failed:', regError);
                }

                try {
                    await invoke('setup_complete_kiosk');
                    await invoke('enable_kiosk_shortcuts');
                    console.log('Kiosk mode enabled');
                } catch (kioskError) {
                    console.warn('Kiosk mode setup failed:', kioskError);
                }
            } catch (error) {
                console.warn('Initialization failed:', error);
            }
        };

        setTimeout(initializeKiosk, 1000);

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    // Keyboard shortcuts (Ctrl+Shift+L to minimize)
    useEffect(() => {
        const handleKeyDown = async (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
                try {
                    const { appWindow } = await import('@tauri-apps/api/window');
                    await appWindow.minimize();
                } catch (err) {
                    console.error('Failed to minimize window:', err);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Local timer to decrement minutes every 60s for smoother UI
    useEffect(() => {
        if (minutesLeft <= 0) return;

        const timer = setInterval(() => {
            setMinutesLeft(prev => Math.max(0, prev - 1));
        }, 60000);

        return () => clearInterval(timer);
    }, [minutesLeft]);

    // Heartbeat and command polling
    useEffect(() => {
        let heartbeatTimer;
        let commandTimer;

        const registerAndHeartbeat = async () => {
            try {
                // Load device credentials
                try {
                    const creds = await invoke("get_device_credentials");
                    if (creds && creds.pc_id) {
                        setPcId(creds.pc_id);
                    }
                } catch (credErr) {
                    console.warn('[Primus] Could not load device credentials:', credErr);
                }

                const sendHeartbeat = async () => {
                    try {
                        const res = await invoke("send_heartbeat");
                        console.log('[Primus] Heartbeat sent via Tauri:', res);
                        const isLocked = res?.status === 'locked';
                        setLocked(isLocked);
                    } catch (tauriErr) {
                        if (pcId) {
                            try {
                                const res = await axios.post(
                                    `${getApiBase()}/api/clientpc/heartbeat/${pcId}`,
                                    null,
                                    {
                                        headers: {
                                            ...authHeaders(),
                                            ...csrfHeaders(),
                                            'X-PC-ID': String(pcId)
                                        }
                                    }
                                );
                                setLocked(res?.data?.status === 'locked');
                            } catch (httpErr) {
                                console.warn('[Primus] HTTP heartbeat failed:', httpErr);
                            }
                        }
                    }
                };

                await sendHeartbeat();
                heartbeatTimer = setInterval(sendHeartbeat, 20000); // 20 second heartbeat

                const pollCommands = async () => {
                    try {
                        if (!pcId) return;
                        const res = await axios.post(
                            `${getApiBase()}/api/command/pull`,
                            new URLSearchParams({ pc_id: String(pcId) }),
                            { headers: { ...authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded', ...csrfHeaders() } }
                        );
                        if (res.data && res.data.command) {
                            const cmd = res.data.command;
                            if (cmd === 'message' && res.data.params) {
                                try {
                                    const p = JSON.parse(res.data.params);
                                    showToast(p.text || 'Message');
                                } catch {
                                    showToast(res.data.params);
                                }
                            }
                            if (cmd === 'logout') {
                                localStorage.removeItem('primus_jwt');
                                window.location.reload();
                            }
                            if (cmd === 'shutdown') {
                                try { await invoke('system_shutdown'); } catch { }
                            }
                            if (cmd === 'restart') {
                                try { await invoke('system_restart'); } catch { }
                            }
                        }
                    } catch { }
                };

                commandTimer = setInterval(pollCommands, 5000);
            } catch (e) {
                console.warn('[Primus] Heartbeat setup failed:', e);
            }
        };

        registerAndHeartbeat();

        return () => {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (commandTimer) clearInterval(commandTimer);
        };
    }, [currentUser, pcId]);

    // Flush offline queue when back online
    useEffect(() => {
        if (networkOnline) {
            flushQueue();
        }
    }, [networkOnline]);

    const handleLogin = (token) => {
        localStorage.setItem("primus_jwt", token);
        setJwt(token);
    };

    const handleLogout = async () => {
        try {
            const sessionId = localStorage.getItem('primus_active_session_id');
            if (sessionId && jwt) {
                await axios.post(
                    `${getApiBase()}/api/session/stop/${sessionId}`,
                    null,
                    { headers: { ...authHeaders(), ...csrfHeaders() } }
                );
            }
        } catch (e) {
            console.warn('[Primus] Failed to stop session on logout:', e);
        }

        localStorage.removeItem("primus_jwt");
        localStorage.removeItem("primus_active_session_id");
        setJwt(null);
        setCurrentUser(null);
    };

    // Device setup screen
    if (deviceSetupState === 'setup-required') {
        return <SetupScreen onComplete={() => setDeviceSetupState('ready')} />;
    }

    if (deviceSetupState === 'loading') {
        return (
            <div className="min-h-screen bg-[#0B0F14] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-[#3ABEFF] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white">Initializing Primus...</p>
                </div>
            </div>
        );
    }

    // Login screen
    if (!jwt || !currentUser) {
        return (
            <div className="min-h-screen overflow-hidden flex flex-col bg-[#0B0F14] relative">
                {!networkOnline && (
                    <div className="absolute top-0 left-0 right-0 bg-yellow-600 text-white text-center py-1 text-xs z-50">
                        🔌 Offline Mode
                    </div>
                )}
                <AuthCombined showRegister={showRegister} setShowRegister={setShowRegister} onLogin={handleLogin} />
            </div>
        );
    }

    // Build user object for Header
    const headerUser = {
        name: currentUser?.full_name || currentUser?.email?.split('@')[0] || 'User',
        initials: (currentUser?.full_name || currentUser?.email || 'U').substring(0, 2).toUpperCase(),
    };

    // Main app with new UI
    return (
        <div className="app">
            <Header
                user={headerUser}
                minutesLeft={minutesLeft}
                cashBalance={cashBalance}
                ggCoins={ggCoins}
                onLogout={handleLogout}
            />
            <main className="main-layout">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/games" element={<GamesPage />} />
                    <Route path="/arcade" element={<ArcadePage />} />
                    <Route path="/apps" element={<AppsPage />} />
                    <Route path="/shop" element={<ShopPage />} />
                    <Route path="/vault" element={<VaultPage />} />
                    <Route path="/account" element={<AccountPage />} />
                    <Route path="/settings" element={<PCSettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}
