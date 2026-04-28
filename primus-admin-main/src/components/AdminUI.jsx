import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import { getApiBase, authHeaders, showToast } from '../utils/api';
import { eventStream } from '../utils/eventStream';
import Login from './Login';
import { settingsAPI, settingsToObject, objectToSettings } from '../utils/settings.js';
import { BarChart, Users, Monitor, DollarSign, Settings as SettingsIcon, Annoyed, LogOut, Search, Clock, Ticket, Package, ShoppingCart, Calendar, MessageSquare, Megaphone } from 'lucide-react';
import ChatPanel from './ChatPanel.jsx';
import NotificationBell from './NotificationBell.jsx';
import StatisticsPage from './StatisticsPage';


// Helper Components

const StatCard = ({ title, value, icon, color }) => (
    <div className="bg-gray-800 p-6 rounded-xl flex items-center space-x-4 shadow-lg">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
        </div>
    </div>
);

StatCard.propTypes = {
    title: PropTypes.string.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    icon: PropTypes.node.isRequired,
    color: PropTypes.string.isRequired
};

const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4">
            <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md m-4 border border-gray-700">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

Modal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired
};

const Button = ({ children, onClick, className = '', variant = 'primary' }) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-md';
    const variants = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-500 focus:ring-4 focus:ring-indigo-500/50',
        secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-4 focus:ring-gray-600/50',
        danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-4 focus:ring-red-500/50',
    };
    return (
        <button onClick={onClick} className={`${baseClasses} ${variants[variant]} ${className}`}>
            {children}
        </button>
    );
};

Button.propTypes = {
    children: PropTypes.node.isRequired,
    onClick: PropTypes.func,
    className: PropTypes.string,
    variant: PropTypes.oneOf(['primary', 'secondary', 'danger'])
};

// Main Page Components

const Dashboard = () => {
    return (
        <div>
            {/* Top row with title and buttons */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-5 h-5 text-gray-200"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    </div>
                    <h1 className="text-xl font-semibold text-white">Homepage</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-sm rounded-md btn-ghost">Edit dashboard</button>
                    <button className="px-3 py-1.5 text-sm rounded-md btn-primary-neo">Add widget</button>
                </div>
            </div>

            {/* Widgets grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Center feed */}
                <div className="card-animated p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-gray-200 font-semibold">Center feed</h2>
                        <button className="text-gray-400 hover:text-white">⋮</button>
                    </div>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-8 h-8 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" /></svg>
                        </div>
                        <p className="text-gray-300 font-semibold">No activity yet</p>
                        <p className="text-gray-500 text-sm mt-1">There is no activity in the center yet for today, click the button below to view previous days.</p>
                        <button className="mt-4 px-4 py-2 text-sm rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600">View full activity tracker</button>
                    </div>
                </div>

                {/* Upcoming reservations */}
                <div className="card-animated p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-gray-200 font-semibold">Upcoming reservations</h2>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200">Today</button>
                            <button className="px-3 py-1 text-xs rounded-md bg-gray-700 text-gray-200">Tomorrow</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-center h-48">
                        <div className="w-10 h-10 rounded-full border-2 border-gray-600 border-t-transparent animate-spin"></div>
                    </div>
                </div>

                {/* Device dashboard */}
                <div className="card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">Device dashboard</h2>
                    <div className="h-48 bg-gray-700/30 rounded-lg"></div>
                </div>

                {/* User time status */}
                <div className="card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">User time status</h2>
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-full border-2 border-gray-600 border-t-transparent animate-spin"></div>
                            <span className="absolute inset-0 flex items-center justify-center text-gray-300">😊</span>
                        </div>
                        <p className="text-gray-500 text-sm mt-4">No users logged in right now</p>
                        <div className="mt-3 flex items-center gap-2">
                            <button className="px-3 py-1.5 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600">Log in user</button>
                            <button className="px-3 py-1.5 text-xs rounded-md bg-gray-700 text-gray-200 hover:bg-gray-600">Log in guest</button>
                        </div>
                    </div>
                </div>

                {/* News Feed full width */}
                <div className="lg:col-span-2 card-animated p-6">
                    <h2 className="text-gray-200 font-semibold mb-2">News Feed</h2>
                    <div className="h-32 bg-gray-700/30 rounded-lg"></div>
                </div>
            </div>
        </div>
    );
};

const PCManagement = () => {
    const [pcs, setPcs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPc, setSelectedPc] = useState(null);
    const [command, setCommand] = useState('');
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [chatPc, setChatPc] = useState(null);
    const [pendingOrders, setPendingOrders] = useState([]);

    const fetchPcs = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            console.log('[PCManagement] Using API base:', base);
            // Prefer cafe-scoped client PCs if available, else fallback to global PCs
            let list = [];
            try {
                const r = await axios.get(`${base}/api/clientpc/`, { headers: authHeaders() });
                list = (r.data || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    status: p.status || 'idle',
                    ip_address: p.ip_address || '—',
                    last_seen: p.last_seen || null,
                    remaining_time: p.remaining_time ?? null,
                    online: p.status === 'online' || p.status === 'in_use',
                    capabilities: p.capabilities || { features: [] },
                    current_user_id: p.current_user_id || null,
                    user_name: p.user_name || null,  // Will be populated by enhanced endpoint
                    session_start: p.session_start || null
                }));
            } catch (e1) {
                console.error('[PCManagement] /api/clientpc/ failed:', e1.response?.status, e1.response?.data || e1.message);
                const r2 = await axios.get(`${base}/api/pc/`, { headers: authHeaders() });
                list = (r2.data || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    status: p.status || 'idle',
                    ip_address: p.ip_address || '—',
                    last_seen: null,
                    remaining_time: null,
                    online: p.status === 'online' || p.status === 'in_use',
                    current_user_id: p.current_user_id || null,
                    user_name: p.user_name || null
                }));
            }
            setPcs(list);
        } catch (e) {
            console.error('[PCManagement] All PC fetches failed:', e.response?.status, e.response?.data || e.message);
            showToast('Failed to load PCs: ' + (e.response?.data?.detail || e.message));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPcs();
    }, [fetchPcs]);

    useEffect(() => {
        // Subscribe to SSE eventStream for real-time PC updates
        const unsubStatus = eventStream.subscribe('pc.status', (data) => {
            const pcId = data.pc_id;
            const payload = data.payload || {};

            setPcs((prev) => {
                let found = false;
                const next = prev.map((pc) => {
                    if (pc.id !== pcId) return pc;
                    found = true;
                    return {
                        ...pc,
                        status: payload.status || pc.status,
                        online: payload.status === 'online',
                        last_seen: data.timestamp
                    };
                });

                if (!found && payload.name) {
                    next.push({
                        id: pcId,
                        name: payload.name,
                        status: payload.status || 'online',
                        ip_address: '—',
                        last_seen: data.timestamp,
                        online: payload.status === 'online',
                    });
                }
                return next;
            });
        });

        const unsubAck = eventStream.subscribe('command.ack', (data) => {
            const payload = data.payload || {};
            if (payload.state === 'SUCCEEDED') {
                showToast(`Command #${payload.command_id} succeeded on PC #${data.pc_id}`);
            } else if (payload.state === 'FAILED') {
                showToast(`Command #${payload.command_id} failed: ${payload.result?.error || 'Unknown error'}`);
            }
        });

        const unsubShop = eventStream.subscribe('shop.purchase', (data) => {
            const payload = data.payload || {};
            const pc = pcs.find(p => p.id === data.pc_id);

            if (payload.status === 'pending') {
                // Add to pending orders list
                setPendingOrders(prev => [...prev, {
                    id: payload.purchase_id,
                    pc_id: data.pc_id,
                    pc_name: pc?.name || `PC #${data.pc_id}`,
                    user_id: payload.user_id,
                    user_name: pc?.user_name || 'Unknown',
                    minutes: payload.minutes_added,
                    pack_id: payload.pack_id,
                    timestamp: new Date().toISOString(),
                }]);
                showToast(`🛒 Pending order from ${pc?.name || 'PC'}: +${payload.minutes_added} min`);
            } else {
                showToast(`PC #${data.pc_id} purchased ${payload.pack_name || 'pack'} (+${payload.minutes_added} min)`);
                if (data.pc_id) {
                    setPcs(prev => prev.map(p =>
                        p.id === data.pc_id
                            ? { ...p, remaining_time: (p.remaining_time || 0) + (payload.minutes_added || 0) }
                            : p
                    ));
                }
            }
        });

        const unsubPayment = eventStream.subscribe('payment.confirmed', (data) => {
            const payload = data.payload || {};
            // Remove from pending orders
            setPendingOrders(prev => prev.filter(o => o.id !== payload.purchase_id));
            showToast(`✅ Payment confirmed for PC #${data.pc_id}`);
            // Update PC remaining time
            if (data.pc_id) {
                setPcs(prev => prev.map(p =>
                    p.id === data.pc_id
                        ? { ...p, remaining_time: Math.floor((payload.new_remaining_time || 0) / 60), status: 'in_use' }
                        : p
                ));
            }
        });

        return () => {
            unsubStatus();
            unsubAck();
            unsubShop();
            unsubPayment();
        };
    }, [pcs]);

    const sendCmd = async (pcId, cmd, paramsObj) => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            const payload = { pc_id: pcId, command: cmd, params: paramsObj ? JSON.stringify(paramsObj) : null };
            await axios.post(`${base}/api/command/send`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast(`Command '${cmd}' sent`);
        } catch (e) {
            showToast('Failed to send command');
        }
    };

    const openCommandModal = (pc, cmd) => {
        setSelectedPc(pc);
        setCommand(cmd);
        setIsModalOpen(true);
    };

    const handleCommand = () => {
        console.log(`Executing command '${command}' on PC ${selectedPc.id}`);
        // Here you would make an API call to /api/command
        // For now, we'll just simulate the change
        if (command === 'lock') {
            setPcs(pcs.map(p => p.id === selectedPc.id ? { ...p, status: 'locked' } : p));
        }
        if (command === 'unlock') {
            setPcs(pcs.map(p => p.id === selectedPc.id ? { ...p, status: 'idle' } : p));
        }
        setIsModalOpen(false);
        setSelectedPc(null);
    };

    const getStatusClasses = (status) => {
        switch (status) {
            case 'in_use': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
            case 'idle': return 'bg-green-500/20 text-green-300 border-green-500/30';
            case 'offline': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
            case 'locked': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
            default: return 'bg-gray-600/20 text-gray-300 border-gray-600/30';
        }
    };

    const confirmPayment = async (order) => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            await axios.post(`${base}/api/shop/confirm-payment`, {
                purchase_id: order.id,
                client_id: order.pc_id,
                user_id: order.user_id,
                minutes: order.minutes,
                payment_method: 'cash'
            }, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast(`✅ Payment confirmed! Session started on ${order.pc_name}`);
            // Remove from local state (will also be removed via WebSocket event)
            setPendingOrders(prev => prev.filter(o => o.id !== order.id));
        } catch (e) {
            showToast('Failed to confirm payment');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-semibold text-white">PC list</h1>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-sm rounded-md btn-ghost">Filters</button>
                    <button className="px-3 py-1.5 text-sm rounded-md btn-primary-neo">Add PC</button>
                </div>
            </div>
            {/* Stat cards row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Today's income</div>
                    <div className="mt-1 text-2xl font-bold text-white">₹ 0.00</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">PCs available</div>
                    <div className="mt-1 text-2xl font-bold text-white">0</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Total gaming time purchased</div>
                    <div className="mt-1 text-2xl font-bold text-white">₹ 0.00</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Total money deposits</div>
                    <div className="mt-1 text-2xl font-bold text-white">₹ 0.00</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Today's sales</div>
                    <div className="mt-1 text-2xl font-bold text-white">₹ 0.00</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Consoles available</div>
                    <div className="mt-1 text-2xl font-bold text-white">0</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Total product spent</div>
                    <div className="mt-1 text-2xl font-bold text-white">₹ 0.00</div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-xs text-gray-400">Total prizes redeemed</div>
                    <div className="mt-1 text-2xl font-bold text-white">0</div>
                </div>
            </div>

            {/* Pending Orders Section */}
            {pendingOrders.length > 0 && (
                <div className="mb-6">
                    <h2 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
                        <span className="animate-pulse w-2 h-2 bg-yellow-500 rounded-full"></span>
                        Pending Orders ({pendingOrders.length})
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {pendingOrders.map(order => (
                            <div key={order.id} className="card-animated p-4 border-l-4 border-yellow-500 bg-yellow-500/5">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-white font-semibold">{order.pc_name}</p>
                                        <p className="text-gray-400 text-sm">User: {order.user_name}</p>
                                    </div>
                                    <span className="text-yellow-400 font-bold">+{order.minutes} min</span>
                                </div>
                                <p className="text-gray-500 text-xs mb-3">{new Date(order.timestamp).toLocaleTimeString()}</p>
                                <button
                                    onClick={() => confirmPayment(order)}
                                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-4 py-2 rounded-lg font-semibold transition-all"
                                >
                                    💳 Confirm Payment
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* PC and Console sections */}
            <h2 className="text-gray-300 font-semibold mb-3">Computers</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {loading && [1, 2, 3, 4].map(i => (<div key={i} className="card-animated p-5 h-40 skeleton-shimmer" />))}
                {!loading && pcs.length === 0 && (
                    <div className="card-animated p-5 text-sm text-gray-400">
                        No systems registered yet. Clients will appear here once they connect.
                    </div>
                )}
                {!loading && pcs.length > 0 && pcs.map(pc => (
                    <div key={pc.id} className="card-animated p-5 flex flex-col justify-between relative">
                        <div>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${pc.online ? 'bg-green-400 animate-pulse' : 'bg-red-500'
                                            }`}
                                    />
                                    <h3 className="text-lg font-bold text-white">{pc.name}</h3>
                                </div>
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusClasses(pc.status)}`}>
                                    {pc.status.replace('_', ' ')}
                                </span>
                                <button className="ml-2 text-gray-400 hover:text-white" onClick={() => setMenuOpenId(menuOpenId === pc.id ? null : pc.id)}>⋮</button>
                            </div>
                            <p className="text-sm text-gray-400 mt-1">{pc.ip_address}</p>
                            {pc.last_seen && (
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Last seen: {new Date(pc.last_seen).toLocaleTimeString()}
                                </p>
                            )}
                            {typeof pc.remaining_time === 'number' && (
                                <p className="text-[11px] text-indigo-300 mt-1">
                                    Remaining time: {pc.remaining_time} min
                                </p>
                            )}
                            {pc.user_name && (
                                <div className="mt-4 text-sm bg-gray-700/50 p-3 rounded-lg">
                                    <p className="text-gray-300">
                                        User:{' '}
                                        <span className="font-semibold text-white">
                                            {pc.user_name}
                                        </span>
                                    </p>
                                    {pc.session_start && (
                                        <p className="text-gray-400 text-xs mt-1">
                                            Session started: {new Date(pc.session_start).toLocaleTimeString()}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <Button
                                onClick={() => sendCmd(pc.id, 'lock')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.capabilities && !pc.capabilities.features.includes('lock')}
                            >Lock</Button>
                            <Button
                                onClick={() => sendCmd(pc.id, 'unlock')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.capabilities && !pc.capabilities.features.includes('unlock')}
                            >Unlock</Button>
                            <Button
                                onClick={() => sendCmd(pc.id, 'restart')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.capabilities && !pc.capabilities.features.includes('restart')}
                            >Restart</Button>
                            <Button
                                onClick={() => { const text = prompt('Message to display on PC'); if (text) sendCmd(pc.id, 'message', { text }); }}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.capabilities && !pc.capabilities.features.includes('message')}
                            >Message</Button>
                            <Button onClick={() => setChatPc(pc)} variant="secondary" className="flex-1 text-xs">
                                <MessageSquare size={12} className="mr-1" /> Chat
                            </Button>
                        </div>
                        {menuOpenId === pc.id && (
                            <div className="absolute -right-2 top-8 z-50 w-48 rounded-lg shadow-2xl"
                                style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={() => { const user = prompt('Login user (email or id)'); if (user) sendCmd(pc.id, 'login', { user }); setMenuOpenId(null); }}>Log in user</button>
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={() => { sendCmd(pc.id, 'logout'); setMenuOpenId(null); }}>Log out user</button>
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={() => { sendCmd(pc.id, 'shutdown'); setMenuOpenId(null); }}>Shutdown PC</button>
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm" onClick={() => { sendCmd(pc.id, 'restart'); setMenuOpenId(null); }}>Reboot PC</button>
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-red-300" onClick={async () => { try { const base = getApiBase().replace(/\/$/, ""); await axios.delete(`${base}/api/clientpc/${pc.id}`, { headers: authHeaders() }); showToast('PC removed'); } catch { showToast('Failed to remove PC'); } finally { setMenuOpenId(null); fetchPcs(); } }}>Remove PC</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <h2 className="text-gray-300 font-semibold mt-8 mb-3">Consoles</h2>
            <div className="skeleton-shimmer rounded-xl h-24 card-animated"></div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Confirm Command: ${command}`}>
                {selectedPc && (
                    <div>
                        <p className="text-gray-300 mb-6">Are you sure you want to <span className="font-bold text-white">{command}</span> PC: <span className="font-bold text-white">{selectedPc.name}</span>?</p>
                        {command === 'message' && (
                            <textarea className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter your message..."></textarea>
                        )}
                        <div className="flex justify-end space-x-4 mt-4">
                            <Button onClick={() => setIsModalOpen(false)} variant="secondary">Cancel</Button>
                            <Button onClick={handleCommand} variant={command === 'restart' ? 'danger' : 'primary'}>Confirm</Button>
                        </div>
                    </div>
                )}
            </Modal>
            {chatPc && <ChatPanel pc={chatPc} onClose={() => setChatPc(null)} />}
        </div>
    );
};

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [action, setAction] = useState('');
    const [amount, setAmount] = useState(0);

    const openUserModal = (user, act) => {
        setSelectedUser(user);
        setAction(act);
        setIsModalOpen(true);
        setAmount(0);
    };

    const handleWalletAction = async () => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            if (action === 'add-time') {
                await axios.post(`${base}/api/offer/admin/add-time/${selectedUser.id}`, null, {
                    params: { hours: parseFloat(amount) },
                    headers: authHeaders()
                });
                showToast(`Added ${amount} hours to ${selectedUser.name}`);
            } else {
                const endpoint = action === 'topup' ? 'topup' : 'deduct';
                await axios.post(`${base}/api/wallet/${endpoint}`, {
                    amount: parseFloat(amount),
                    type: action,
                    user_id: selectedUser.id,
                    description: `Admin ${action} via UI`
                }, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });

                showToast(`Successfully performed ${action}`);

                // Update local state
                setUsers(users.map(u => {
                    if (u.id === selectedUser.id) {
                        const val = parseFloat(amount);
                        const newBalance = action === 'topup' ? u.wallet_balance + val : u.wallet_balance - val;
                        return { ...u, wallet_balance: newBalance };
                    }
                    return u;
                }));
            }
            setIsModalOpen(false);
        } catch (e) {
            console.error(e);
            showToast(`Failed: ${e.response?.data?.detail || e.message}`);
        }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">User Management</h1>
            <div className="bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-700/50">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-gray-900/50">
                        <tr>
                            <th className="p-4 font-semibold">Name</th>
                            <th className="p-4 font-semibold">Email</th>
                            <th className="p-4 font-semibold">Role</th>
                            <th className="p-4 font-semibold">Wallet Balance</th>
                            <th className="p-4 font-semibold">Coins</th>
                            <th className="p-4 font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                        {users.length === 0 && (
                            <tr>
                                <td className="p-4 text-sm text-gray-400" colSpan={6}>
                                    No users loaded yet. Connect to the backend to manage users.
                                </td>
                            </tr>
                        )}
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-700/30 transition-colors">
                                <td className="p-4 font-medium text-white">{user.name}</td>
                                <td className="p-4">{user.email}</td>
                                <td className="p-4"><span className={`px-2 py-1 text-xs rounded-full ${user.role === 'admin' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-600/20 text-gray-300'}`}>{user.role}</span></td>
                                <td className="p-4 font-mono text-green-400">${user.wallet_balance.toFixed(2)}</td>
                                <td className="p-4 font-mono text-yellow-400">{user.coins_balance}</td>
                                <td className="p-4">
                                    <div className="flex space-x-2">
                                        <Button onClick={() => openUserModal(user, 'topup')} variant="secondary" className="text-xs px-2 py-1">Top-up</Button>
                                        <Button onClick={() => openUserModal(user, 'deduct')} variant="danger" className="text-xs px-2 py-1">Deduct</Button>
                                        <Button onClick={() => openUserModal(user, 'add-time')} variant="primary" className="text-xs px-2 py-1 bg-green-600 hover:bg-green-500">Add Time</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`${action === 'topup' ? 'Top-up' : action === 'add-time' ? 'Add Time' : 'Deduct from'} ${action === 'add-time' ? 'User' : 'Wallet'}`}>
                {selectedUser && (
                    <div>
                        <p className="text-gray-300 mb-4">User: <span className="font-bold text-white">{selectedUser.name}</span></p>
                        <p className="text-gray-300 mb-4">Current Balance: <span className="font-bold text-green-400">${selectedUser.wallet_balance.toFixed(2)}</span></p>
                        <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-2">{action === 'add-time' ? 'Hours' : 'Amount'}</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <span className="text-gray-400 sm:text-sm">{action === 'add-time' ? '⏱️' : '$'}</span>
                            </div>
                            <input
                                type="number"
                                id="amount"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 pl-7 text-white placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="0.00"
                            />
                        </div>
                        <div className="flex justify-end space-x-4 mt-6">
                            <Button onClick={() => setIsModalOpen(false)} variant="secondary">Cancel</Button>
                            <Button onClick={handleWalletAction} variant="primary">Confirm</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

const GameManagement = () => (
    <div>
        <h1 className="text-3xl font-bold text-white mb-6">Game Library</h1>
        <div className="card-animated p-6 text-sm text-gray-400">
            No games loaded. Configure games in the backend to see them listed here.
        </div>
    </div>
);

const ShopPage = ({ cafeInfo }) => {
    const [activeTab, setActiveTab] = useState('TimePacks');
    const [offers, setOffers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editOffer, setEditOffer] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', hours: '', price: '', description: '', active: true });

    const tabs = ['TimePacks', 'Products', 'Prizes'];

    const fetchOffers = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            const res = await axios.get(`${base}/api/shop/packs`, { headers: authHeaders() });
            setOffers(res.data || []);
        } catch (e) {
            showToast('Failed to load time packs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOffers(); }, [fetchOffers]);

    const openCreate = () => {
        setEditOffer(null);
        setForm({ name: '', hours: '', price: '', description: '', active: true });
        setShowModal(true);
    };

    const openEdit = (offer) => {
        setEditOffer(offer);
        setForm({
            name: offer.name,
            hours: String((offer.minutes / 60).toFixed(1)),
            price: String(offer.price),
            description: offer.description || '',
            active: offer.active ?? true,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.hours || !form.price) {
            showToast('Name, hours and price are required');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, "");
            // cafe_id is NOT sent — backend injects it from JWT
            const payload = {
                name: form.name.trim(),
                hours: parseFloat(form.hours),
                price: parseFloat(form.price),
                description: form.description.trim() || null,
                active: form.active,
            };
            if (editOffer) {
                await axios.put(`${base}/api/shop/offers/${editOffer.id}`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
                showToast('Package updated');
            } else {
                await axios.post(`${base}/api/shop/offers`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
                showToast('Package created');
            }
            setShowModal(false);
            fetchOffers();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save package');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this package? It will be hidden from customers.')) return;
        try {
            const base = getApiBase().replace(/\/$/, "");
            await axios.delete(`${base}/api/shop/offers/${id}`, { headers: authHeaders() });
            showToast('Package removed');
            fetchOffers();
        } catch {
            showToast('Failed to delete');
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Shop Management</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">Packages for: <span className="font-semibold">{cafeName}</span></p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ Add Time Package</button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-3 mb-6 mt-4">
                {tabs.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`pill ${activeTab === t ? 'pill-active' : ''}`}>{t}</button>
                ))}
            </div>

            {activeTab === 'TimePacks' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {loading && [1, 2, 3, 4].map(i => <div key={i} className="card-animated h-48 skeleton-shimmer" />)}
                    {!loading && offers.length === 0 && (
                        <div className="card-animated p-6 text-gray-400 col-span-full">
                            No time packages found. Click "+ Add Time Package" to create one.
                        </div>
                    )}
                    {!loading && offers.map(offer => (
                        <div key={offer.id} className="card-animated p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-bold text-white">{offer.name}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${offer.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {offer.active ? 'Active' : 'Hidden'}
                                    </span>
                                </div>
                                <p className="text-3xl font-bold text-indigo-400 mb-1">₹{Number(offer.price).toFixed(2)}</p>
                                <p className="text-sm text-gray-400">{offer.minutes} min ({(offer.minutes / 60).toFixed(1)} hrs)</p>
                                {offer.description && <p className="text-xs text-gray-500 mt-2">{offer.description}</p>}
                            </div>
                            <div className="flex gap-2 mt-4">
                                <button onClick={() => openEdit(offer)} className="flex-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Edit</button>
                                <button onClick={() => handleDelete(offer.id)} className="px-3 py-2 text-sm rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors">Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'Products' && (
                <div className="card-animated p-6 text-gray-400">Product management coming soon.</div>
            )}

            {activeTab === 'Prizes' && (
                <div className="card-animated p-6 text-gray-400">Prize management coming soon.</div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">{editOffer ? 'Edit Package' : 'New Time Package'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Package Name *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g., 2 Hour Pass" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Hours *</label>
                                    <input type="number" step="0.5" min="0.5" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })}
                                        placeholder="2" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Price (₹) *</label>
                                    <input type="number" min="0" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                                        placeholder="180" />
                                </div>
                            </div>
                            {form.hours && <p className="text-xs text-indigo-400">= {Math.round(parseFloat(form.hours || 0) * 60)} minutes</p>}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Description (optional)</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Best value bundle" />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                                Active (visible to customers)
                            </label>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save Package'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Coupons (Bugzilla #1) ─────────────────────────────────────────
// Admin CRUD over POST /api/coupon/ + GET /api/coupon/. Backend
// CouponIn schema: { code, discount_percent, max_uses, per_user_limit,
// expires_at, applies_to }. cafe_id is injected from JWT, never sent.
const CouponsPage = ({ cafeInfo }) => {
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        code: '',
        discount_percent: '',
        max_uses: '',
        per_user_limit: '',
        expires_at: '',
        applies_to: '*',
    });

    const fetchCoupons = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            const res = await axios.get(`${base}/api/coupon/`, { headers: authHeaders() });
            setCoupons(res.data || []);
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to load coupons');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

    const openCreate = () => {
        setForm({
            code: '',
            discount_percent: '',
            max_uses: '',
            per_user_limit: '',
            expires_at: '',
            applies_to: '*',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        const code = form.code.trim().toUpperCase();
        if (!code) {
            showToast('Coupon code is required');
            return;
        }
        const discount = parseFloat(form.discount_percent || '0');
        if (Number.isNaN(discount) || discount < 0 || discount > 100) {
            showToast('Discount must be between 0 and 100');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, "");
            const payload = {
                code,
                discount_percent: discount,
                max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
                per_user_limit: form.per_user_limit ? parseInt(form.per_user_limit, 10) : null,
                // <input type="datetime-local"> gives us "YYYY-MM-DDTHH:mm";
                // backend's CouponIn expects an ISO datetime so append :00 if needed.
                expires_at: form.expires_at
                    ? new Date(form.expires_at).toISOString()
                    : null,
                applies_to: form.applies_to.trim() || '*',
            };
            await axios.post(`${base}/api/coupon/`, payload, {
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            });
            showToast(`Coupon "${code}" created`);
            setShowModal(false);
            fetchCoupons();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save coupon');
        } finally {
            setSaving(false);
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Coupons</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">
                            Coupons for: <span className="font-semibold">{cafeName}</span>
                        </p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ New Coupon</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {loading && [1, 2, 3].map(i => <div key={i} className="card-animated h-40 skeleton-shimmer" />)}
                {!loading && coupons.length === 0 && (
                    <div className="card-animated p-6 text-gray-400 col-span-full">
                        No coupons yet. Click "+ New Coupon" to create one.
                    </div>
                )}
                {!loading && coupons.map(c => {
                    const expired = c.expires_at && new Date(c.expires_at) < new Date();
                    const exhausted = c.max_uses && c.times_used >= c.max_uses;
                    const status = expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active';
                    const statusClass = expired || exhausted
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-green-500/20 text-green-400';
                    return (
                        <div key={c.id} className="card-animated p-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-bold text-white font-mono tracking-wider">{c.code}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>{status}</span>
                            </div>
                            <p className="text-3xl font-bold text-indigo-400 mb-1">{c.discount_percent}% off</p>
                            <p className="text-xs text-gray-400 mt-2">
                                Used {c.times_used}{c.max_uses ? ` / ${c.max_uses}` : ''}
                                {c.per_user_limit ? ` · ${c.per_user_limit}/user` : ''}
                            </p>
                            {c.expires_at && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Expires {new Date(c.expires_at).toLocaleString()}
                                </p>
                            )}
                            {c.applies_to && c.applies_to !== '*' && (
                                <p className="text-xs text-gray-500 mt-1">Applies to: {c.applies_to}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">New Coupon</h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Code *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white font-mono uppercase"
                                    value={form.code}
                                    onChange={e => setForm({ ...form, code: e.target.value })}
                                    placeholder="WELCOME10" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Discount % *</label>
                                    <input type="number" min="0" max="100" step="0.1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.discount_percent}
                                        onChange={e => setForm({ ...form, discount_percent: e.target.value })}
                                        placeholder="10" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Applies to</label>
                                    <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.applies_to}
                                        onChange={e => setForm({ ...form, applies_to: e.target.value })}
                                        placeholder="* (everything)" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Max uses</label>
                                    <input type="number" min="1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.max_uses}
                                        onChange={e => setForm({ ...form, max_uses: e.target.value })}
                                        placeholder="100" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Per-user limit</label>
                                    <input type="number" min="1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.per_user_limit}
                                        onChange={e => setForm({ ...form, per_user_limit: e.target.value })}
                                        placeholder="1" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Expires (optional)</label>
                                <input type="datetime-local"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.expires_at}
                                    onChange={e => setForm({ ...form, expires_at: e.target.value })} />
                            </div>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : 'Create Coupon'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

CouponsPage.propTypes = {
    cafeInfo: PropTypes.object,
};

// ── Campaigns (Bugzilla #3) ───────────────────────────────────────
// Admin CRUD over /api/campaign/. Backend CampaignIn schema:
// { name, type, content, image_url, discount_percent, target_audience,
//   start_date, end_date, active }. <input type="datetime-local"> values
// are converted to ISO via new Date(...).toISOString() before POSTing.
const CampaignsPage = ({ cafeInfo }) => {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editCampaign, setEditCampaign] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        type: 'discount',
        content: '',
        image_url: '',
        discount_percent: '',
        target_audience: 'all',
        start_date: '',
        end_date: '',
        active: true,
    });

    const fetchCampaigns = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            const res = await axios.get(`${base}/api/campaign/`, { headers: authHeaders() });
            setCampaigns(res.data || []);
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to load campaigns');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

    const openCreate = () => {
        setEditCampaign(null);
        setForm({
            name: '',
            type: 'discount',
            content: '',
            image_url: '',
            discount_percent: '',
            target_audience: 'all',
            start_date: '',
            end_date: '',
            active: true,
        });
        setShowModal(true);
    };

    const openEdit = (c) => {
        setEditCampaign(c);
        const toLocalInput = (iso) =>
            iso ? new Date(iso).toISOString().slice(0, 16) : '';
        setForm({
            name: c.name || '',
            type: c.type || 'discount',
            content: c.content || '',
            image_url: c.image_url || '',
            discount_percent: String(c.discount_percent ?? ''),
            target_audience: c.target_audience || 'all',
            start_date: toLocalInput(c.start_date),
            end_date: toLocalInput(c.end_date),
            active: c.active ?? true,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            showToast('Name is required');
            return;
        }
        if (form.start_date && form.end_date &&
            new Date(form.end_date) < new Date(form.start_date)) {
            showToast('End date must be after start date');
            return;
        }
        try {
            setSaving(true);
            const base = getApiBase().replace(/\/$/, "");
            const payload = {
                name: form.name.trim(),
                type: form.type,
                content: form.content.trim() || null,
                image_url: form.image_url.trim() || null,
                discount_percent: parseFloat(form.discount_percent || '0'),
                target_audience: form.target_audience,
                // Always send ISO 8601; backend rejects naive strings.
                start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
                end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
                active: form.active,
            };
            if (editCampaign) {
                await axios.put(`${base}/api/campaign/${editCampaign.id}`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast('Campaign updated');
            } else {
                await axios.post(`${base}/api/campaign/`, payload, {
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                });
                showToast('Campaign created');
            }
            setShowModal(false);
            fetchCampaigns();
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to save campaign');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (c) => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            await axios.patch(`${base}/api/campaign/${c.id}/toggle`, null, {
                headers: authHeaders(),
            });
            fetchCampaigns();
        } catch (e) {
            showToast('Failed to toggle');
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this campaign?')) return;
        try {
            const base = getApiBase().replace(/\/$/, "");
            await axios.delete(`${base}/api/campaign/${id}`, { headers: authHeaders() });
            showToast('Campaign deleted');
            fetchCampaigns();
        } catch {
            showToast('Failed to delete');
        }
    };

    const cafeName = cafeInfo?.name || cafeInfo?.cafe_name || '';

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-white">Campaigns</h1>
                    {cafeName && (
                        <p className="text-sm text-indigo-400 mt-1">
                            Campaigns for: <span className="font-semibold">{cafeName}</span>
                        </p>
                    )}
                </div>
                <button onClick={openCreate} className="btn-primary-neo px-4 py-2 rounded-md">+ New Campaign</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {loading && [1, 2].map(i => <div key={i} className="card-animated h-48 skeleton-shimmer" />)}
                {!loading && campaigns.length === 0 && (
                    <div className="card-animated p-6 text-gray-400 col-span-full">
                        No campaigns yet. Click "+ New Campaign" to launch one.
                    </div>
                )}
                {!loading && campaigns.map(c => (
                    <div key={c.id} className="card-animated p-6">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-white">{c.name}</h3>
                                <p className="text-xs text-gray-400 mt-1">
                                    {c.type} · {c.target_audience}
                                </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                {c.active ? 'Active' : 'Paused'}
                            </span>
                        </div>
                        {c.discount_percent > 0 && (
                            <p className="text-2xl font-bold text-indigo-400 mb-2">{c.discount_percent}% off</p>
                        )}
                        {c.content && <p className="text-sm text-gray-300 mt-2">{c.content}</p>}
                        <div className="text-xs text-gray-500 mt-3 space-y-0.5">
                            {c.start_date && <p>Starts: {new Date(c.start_date).toLocaleString()}</p>}
                            {c.end_date && <p>Ends: {new Date(c.end_date).toLocaleString()}</p>}
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => openEdit(c)} className="flex-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-600 transition-colors">Edit</button>
                            <button onClick={() => handleToggle(c)} className="px-3 py-2 text-sm rounded-md bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 transition-colors">
                                {c.active ? 'Pause' : 'Resume'}
                            </button>
                            <button onClick={() => handleDelete(c.id)} className="px-3 py-2 text-sm rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 transition-colors">Delete</button>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg rounded-xl max-h-[90vh] overflow-y-auto"
                        style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#1a1d21] z-10">
                            <h3 className="text-white font-semibold">
                                {editCampaign ? 'Edit Campaign' : 'New Campaign'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Name *</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Friday Night LAN" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Type</label>
                                    <select className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.type}
                                        onChange={e => setForm({ ...form, type: e.target.value })}>
                                        <option value="discount">Discount</option>
                                        <option value="announcement">Announcement</option>
                                        <option value="promotion">Promotion</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Audience</label>
                                    <select className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.target_audience}
                                        onChange={e => setForm({ ...form, target_audience: e.target.value })}>
                                        <option value="all">Everyone</option>
                                        <option value="members">Members only</option>
                                        <option value="guests">Guests only</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Description / Body</label>
                                <textarea rows="3"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    placeholder="Half-price hourly packs all night long" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Discount %</label>
                                    <input type="number" min="0" max="100" step="0.1"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.discount_percent}
                                        onChange={e => setForm({ ...form, discount_percent: e.target.value })}
                                        placeholder="0" />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Image URL</label>
                                    <input className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.image_url}
                                        onChange={e => setForm({ ...form, image_url: e.target.value })}
                                        placeholder="https://…" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Starts</label>
                                    <input type="datetime-local"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.start_date}
                                        onChange={e => setForm({ ...form, start_date: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-400 block mb-1">Ends</label>
                                    <input type="datetime-local"
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        value={form.end_date}
                                        onChange={e => setForm({ ...form, end_date: e.target.value })} />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input type="checkbox" checked={form.active}
                                    onChange={e => setForm({ ...form, active: e.target.checked })} />
                                Active
                            </label>
                        </div>
                        <div className="p-4 border-t border-white/10 flex justify-end gap-2 sticky bottom-0 bg-[#1a1d21]">
                            <button onClick={() => setShowModal(false)} className="pill">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="btn-primary-neo px-4 py-2 rounded-md disabled:opacity-50">
                                {saving ? 'Saving…' : (editCampaign ? 'Save Changes' : 'Create Campaign')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

CampaignsPage.propTypes = {
    cafeInfo: PropTypes.object,
};

const Financials = () => (
    <div>
        <h1 className="text-3xl font-bold text-white mb-6">Financials</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center"><Package className="mr-3 text-indigo-400" /> Offers & Packages</h2>
                <div className="text-gray-400 text-sm">
                    No offers loaded. Configure membership packages and offers in the backend.
                </div>
            </div>
            <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700/50">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center"><DollarSign className="mr-3 text-indigo-400" /> Pricing Rules</h2>
                <div className="text-gray-400 text-sm">
                    Pricing rule management coming soon. No demo pricing data is displayed.
                </div>
            </div>
        </div>
    </div>
);

const Settings = () => (
    <SettingsRoot />
);

const UsersPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState(null);
    const [showAddTime, setShowAddTime] = useState(null); // user object or null
    const [hoursToAdd, setHoursToAdd] = useState('1');

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            const r = await axios.get(`${base}/api/user/`, { headers: authHeaders() });
            setUsers(r.data || []);
        } catch {
            showToast('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const exportUsers = async () => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            const res = await fetch(`${base}/api/user/export`, { headers: authHeaders() });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'users.csv'; a.click();
            URL.revokeObjectURL(url);
        } catch {
            showToast('Export failed');
        }
    };

    const onImported = async (result) => {
        showToast(`Imported ${result?.created || 0} users`);
        setShowImport(false);
        fetchUsers();
    };

    const handleAddTime = async () => {
        if (!showAddTime) return;
        const hours = parseFloat(hoursToAdd);
        if (isNaN(hours) || hours <= 0) {
            showToast('Please enter a valid number of hours');
            return;
        }
        try {
            const base = getApiBase().replace(/\/$/, "");
            await axios.post(`${base}/api/offer/admin/add-time/${showAddTime.id}?hours=${hours}`, null, { headers: authHeaders() });
            showToast(`Added ${hours} hour(s) to ${showAddTime.username || showAddTime.email}`);
            setShowAddTime(null);
            setHoursToAdd('1');
        } catch (e) {
            showToast(e?.response?.data?.detail || 'Failed to add time');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-3xl font-bold text-white">Users</h1>
                <div className="flex items-center gap-2">
                    <button className="pill" onClick={exportUsers}>Export users</button>
                    <button className="btn-primary-neo px-3 py-1.5 rounded-md" onClick={() => setShowAdd(true)}>Add user</button>
                    <button className="pill" onClick={() => setShowImport(true)}>Import users</button>
                    <button className="pill">User group</button>
                </div>
            </div>
            <div className="card-animated overflow-visible" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase sticky top-0" style={{ background: '#1a1d21' }}>
                        <tr>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">EMAIL</th>
                            <th className="p-3">ACCOUNT BALANCE</th>
                            <th className="p-3">COINS BALANCE</th>
                            <th className="p-3">TIME LEFT (Hours)</th>
                            <th className="p-3">USER GROUP</th>
                            <th className="p-3 text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td className="p-6 text-gray-500" colSpan={7}>Loading...</td></tr>
                        )}
                        {!loading && users.length === 0 && (
                            <tr><td className="p-6 text-gray-500" colSpan={7}>No records available.</td></tr>
                        )}
                        {!loading && users.map((u, index) => (
                            <tr key={u.id} className="border-t border-white/10">
                                <td className="p-3 text-white">{u.username || u.name}</td>
                                <td className="p-3">{u.email}</td>
                                <td className="p-3">₹ {Number(u.wallet_balance || u.account_balance || 0).toFixed(2)}</td>
                                <td className="p-3">{u.coins_balance || 0}</td>
                                <td className="p-3">{u.time_remaining_hours != null ? u.time_remaining_hours.toFixed(1) : '-'}</td>
                                <td className="p-3">{u.user_group || '-'}</td>
                                <td className="p-3 text-right relative">
                                    <button
                                        className="text-gray-400 hover:text-white px-2 py-1"
                                        onClick={() => setMenuOpenId(menuOpenId === u.id ? null : u.id)}
                                    >
                                        ⋮
                                    </button>
                                    {menuOpenId === u.id && (
                                        <div
                                            className="absolute right-0 z-50 w-40 rounded-lg shadow-2xl"
                                            style={{
                                                background: '#1a1d21',
                                                border: '1px solid #2a2d31',
                                                bottom: index >= users.length - 2 ? '100%' : 'auto',
                                                top: index >= users.length - 2 ? 'auto' : '100%'
                                            }}
                                        >
                                            <button
                                                className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-white"
                                                onClick={() => { setShowAddTime(u); setMenuOpenId(null); }}
                                            >
                                                ⏱️ Add Time
                                            </button>
                                            <button
                                                className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-white"
                                                onClick={() => { setMenuOpenId(null); showToast('Edit user coming soon'); }}
                                            >
                                                ✏️ Edit User
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); fetchUsers(); }} />}
            {showImport && <ImportUsersModal onClose={() => setShowImport(false)} onImported={onImported} />}

            {/* Add Time Modal */}
            {showAddTime && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-white font-semibold">Add Time to User</h3>
                            <button onClick={() => setShowAddTime(null)} className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-gray-300">
                                Adding time to: <span className="text-white font-semibold">{showAddTime.username || showAddTime.name || showAddTime.email}</span>
                            </p>
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Hours to Add</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={hoursToAdd}
                                    onChange={(e) => setHoursToAdd(e.target.value)}
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white"
                                    placeholder="1"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowAddTime(null)} className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600">Cancel</button>
                                <button onClick={handleAddTime} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500">Add Time</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


const AddUserModal = ({ onClose, onSaved }) => {
    const [form, setForm] = useState({ username: '', email: '', password: '' });
    const [busy, setBusy] = useState(false);
    const set = (k, v) => setForm(s => ({ ...s, [k]: v }));
    const save = async () => {
        try {
            setBusy(true);
            const base = getApiBase().replace(/\/$/, "");
            const payload = { name: form.username, email: form.email, password: form.password, role: 'client', first_name: form.first_name || null, last_name: form.last_name || null, phone: form.phone || null };
            await axios.post(`${base}/api/user/create`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast('User created');
            onSaved && onSaved();
        } catch { showToast('Failed to create user'); } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between"><h3 className="text-white font-semibold">New user</h3><button onClick={onClose} className="text-gray-400 hover:text-white">✕</button></div>
                <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Username</div>
                        <input className="search-input w-full rounded-md px-3 py-2" value={form.username} onChange={e => set('username', e.target.value)} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Password</div>
                        <input type="password" className="search-input w-full rounded-md px-3 py-2" value={form.password} onChange={e => set('password', e.target.value)} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 mb-1">Email</div>
                        <input className="search-input w-full rounded-md px-3 py-2" value={form.email} onChange={e => set('email', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><div className="text-xs text-gray-400 mb-1">First name</div><input className="search-input w-full rounded-md px-3 py-2" value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} /></div>
                        <div><div className="text-xs text-gray-400 mb-1">Last name</div><input className="search-input w-full rounded-md px-3 py-2" value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></div>
                    </div>
                    <div><div className="text-xs text-gray-400 mb-1">Phone number</div><input className="search-input w-full rounded-md px-3 py-2" value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
                </div>
                <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
                    <button className="pill" onClick={onClose}>Cancel</button>
                    <button className="btn-primary-neo px-4 py-2 rounded-md" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

const ImportUsersModal = ({ onClose, onImported }) => {
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const upload = async () => {
        if (!file) return;
        try {
            setBusy(true);
            const base = getApiBase().replace(/\/$/, "");
            const fd = new FormData();
            fd.append('file', file);
            const r = await fetch(`${base}/api/user/import`, { method: 'POST', headers: authHeaders(), body: fd });
            const j = await r.json().catch(() => null);
            onImported && onImported(j || { created: 0 });
        } catch { showToast('Import failed'); } finally { setBusy(false); }
    };
    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between"><h3 className="text-white font-semibold">Import users</h3><button onClick={onClose} className="text-gray-400 hover:text-white">✕</button></div>
                <div className="p-4 space-y-3">
                    <div className="text-sm text-gray-300">Upload a .CSV with headers: username,email,password,first_name,last_name,phone,role</div>
                    <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-gray-200" />
                </div>
                <div className="p-4 border-t border-white/10 flex items-center justify-end gap-2">
                    <button className="pill" onClick={onClose}>Cancel</button>
                    <button className="btn-primary-neo px-4 py-2 rounded-md" disabled={!file || busy} onClick={upload}>{busy ? 'Uploading...' : 'Import'}</button>
                </div>
            </div>
        </div>
    );
};

const OrdersPage = () => {
    const [active, setActive] = useState('All orders');
    const tabs = ['All orders', 'Transactions', 'Awaiting payment', 'Awaiting delivery', 'Post-Pay (locked)'];
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchOrders = useCallback(async () => {
        try { setLoading(true); const r = await axios.get(`${getApiBase().replace(/\/$/, '')}/api/payment/order`, { headers: authHeaders() }); setOrders(r.data || []); } catch { setOrders([]); } finally { setLoading(false); }
    }, []);
    useEffect(() => { fetchOrders(); }, [fetchOrders]);
    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Orders</h1>
            <div className="flex items-center gap-2 mb-3">
                {tabs.map(t => (<button key={t} onClick={() => setActive(t)} className={`pill ${active === t ? 'pill-active' : ''}`}>{t}{t.includes('Awaiting') || t.includes('Post-Pay') ? <span className="ml-2 text-xs opacity-80">0</span> : null}</button>))}
            </div>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">DATE/TIME</th>
                            <th className="p-3">STATUS</th>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">ACTION</th>
                            <th className="p-3">DETAILS</th>
                            <th className="p-3">AMOUNT</th>
                            <th className="p-3">SOURCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={7}>Loading...</td></tr>)}
                        {!loading && orders.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={7}>No records available.</td></tr>)}
                        {!loading && orders.map(o => (
                            <tr key={o.id} className="border-t border-white/10">
                                <td className="p-3">{o.datetime || '-'}</td>
                                <td className="p-3">{o.status}</td>
                                <td className="p-3">{o.username || '-'}</td>
                                <td className="p-3">{o.action}</td>
                                <td className="p-3">{o.details}</td>
                                <td className="p-3">₹ {Number(o.amount || 0).toFixed(2)}</td>
                                <td className="p-3">{o.source}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const GuestsPage = () => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const fetchGuests = useCallback(async () => { try { setLoading(true); const r = await axios.get(`${getApiBase().replace(/\/$/, '')}/api/session/guests`, { headers: authHeaders() }); setRows(r.data || []); } catch { setRows([]); } finally { setLoading(false); } }, []);
    useEffect(() => { fetchGuests(); const t = setInterval(fetchGuests, 15000); return () => clearInterval(t); }, [fetchGuests]);
    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Guests</h1>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">SESSION NAME</th>
                            <th className="p-3">DEVICE NAME</th>
                            <th className="p-3">STATUS</th>
                            <th className="p-3">SESSION TYPE</th>
                            <th className="p-3">TIME PLAYED</th>
                            <th className="p-3">STARTED AT</th>
                            <th className="p-3">ENDED AT</th>
                            <th className="p-3">LOGGED IN BY</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={8}>Loading...</td></tr>)}
                        {!loading && rows.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={8}>No records available.</td></tr>)}
                        {!loading && rows.map(s => (
                            <tr key={s.id} className="border-t border-white/10">
                                <td className="p-3">Session #{s.id}</td>
                                <td className="p-3">PC-{s.pc_id}</td>
                                <td className="p-3">active</td>
                                <td className="p-3">Guest</td>
                                <td className="p-3">{s.start_time ? `${Math.floor((Date.now() - new Date(s.start_time).getTime()) / 60000)}m` : '-'}</td>
                                <td className="p-3">{s.start_time || '-'}</td>
                                <td className="p-3">{s.end_time || '-'}</td>
                                <td className="p-3">{s.user_id || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const BookingsPage = () => {
    const [date, setDate] = useState(() => new Date());
    const [showCal, setShowCal] = useState(false);
    const [pcs, setPcs] = useState([]);
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const nextDay = () => setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
    const prevDay = () => setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
    const fmt = (d) => d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const fetchPcs = useCallback(async () => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            let list = [];
            try { const r = await axios.get(`${base}/api/clientpc/`, { headers: authHeaders() }); list = (r.data || []).map(p => ({ id: p.id, name: p.name })); }
            catch { const r2 = await axios.get(`${base}/api/pc/`, { headers: authHeaders() }); list = (r2.data || []).map(p => ({ id: p.id, name: p.name })); }
            setPcs(list);
        } catch { }
    }, []);
    useEffect(() => { fetchPcs(); }, [fetchPcs]);

    // Calendar model: one year forward only, no past dates
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const oneYear = new Date(); oneYear.setFullYear(oneYear.getFullYear() + 1);
    const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const buildCalendar = () => {
        const y = date.getFullYear(); const m = date.getMonth();
        const first = new Date(y, m, 1); const startIndex = (first.getDay() + 6) % 7; // start Monday-like
        const total = daysInMonth(y, m);
        const days = [];
        for (let i = 0; i < startIndex; i++) days.push(null);
        for (let d = 1; d <= total; d++) days.push(new Date(y, m, d));
        return days;
    };

    const hours = Array.from({ length: 24 }, (_, i) => (i === 0 ? '12:00 am' : i < 12 ? `${i}:00 am` : i === 12 ? '12:00 pm' : `${i - 12}:00 pm`));
    const hourToColumn = (d) => d.getHours();
    const createBooking = async (pcId, hourIndex) => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            const start = new Date(date); start.setHours(hourIndex, 0, 0, 0);
            const end = new Date(start); end.setHours(start.getHours() + 1);
            const payload = { pc_id: pcId, start_time: start.toISOString(), end_time: end.toISOString() };
            await axios.post(`${base}/api/booking/`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast('Booking created');
        } catch { showToast('Failed to create booking'); }
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Bookings</h1>
            <div className="flex items-center justify-center mb-4 gap-2">
                <button className="pill" onClick={prevDay}>‹</button>
                <button className="pill" onClick={() => setShowCal(s => !s)}>{fmt(date)}</button>
                <button className="pill" onClick={nextDay}>›</button>
            </div>
            {showCal && (
                <div className="calendar-pop mx-auto mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{date.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                        <div className="flex gap-2">
                            <button className="pill" onClick={() => setDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n < today ? today : n; })}>‹</button>
                            <button className="pill" onClick={() => setDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n > oneYear ? oneYear : n; })}>›</button>
                        </div>
                    </div>
                    <div className="calendar-grid text-xs mb-1">
                        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(k => <div key={k} className="text-center text-gray-400 py-1">{k}</div>)}
                    </div>
                    <div className="calendar-grid">
                        {buildCalendar().map((d, i) => d ? (
                            <button key={i} className={`calendar-day ${+d === +startOfDay(date) ? 'active' : ''} ${d < today || d > oneYear ? 'disabled' : ''}`} onClick={() => { if (d >= today && d <= oneYear) { setDate(d); setShowCal(false); } }}>{d.getDate()}</button>
                        ) : <div key={i} />)}
                    </div>
                </div>
            )}
            {/* Header timeline */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {hours.map((h, i) => (<div key={i} className="min-w-[120px] text-center text-gray-300 bg-white/5 rounded-md py-2">{h}</div>))}
            </div>
            {/* Rows per PC */}
            <div className="space-y-2">
                {pcs.map(pc => (
                    <div key={pc.id} className="flex items-center gap-2">
                        <div className="w-40 text-gray-300">{pc.name}</div>
                        <div className="flex-1 overflow-x-auto">
                            <div className="flex gap-2">
                                {hours.map((_, i) => (<button key={i} onClick={() => createBooking(pc.id, i)} className="min-w-[120px] h-8 bg-white/3 rounded-md relative hover:bg-white/6" />))}
                            </div>
                        </div>
                    </div>
                ))}
                {pcs.length === 0 && <div className="text-gray-500">No systems registered.</div>}
            </div>
        </div>
    );
};

const ActivityPage = () => {
    const [filters, setFilters] = useState({ start: '', end: '', category: '', pc: '', employee: '', user: '' });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const set = (k, v) => setFilters(s => ({ ...s, [k]: v }));
    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const base = getApiBase().replace(/\/$/, "");
            const url = new URL(`${base}/api/audit/`);
            Object.entries(filters).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
            const r = await axios.get(url.toString(), { headers: authHeaders() });
            setLogs(r.data || []);
        } catch { setLogs([]); } finally { setLoading(false); }
    }, [filters]);
    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const exportCsv = () => {
        const header = ['datetime', 'username', 'action', 'details', 'amount', 'coins', 'pc', 'source'];
        const rows = logs.map(l => [l.timestamp || '', l.user_id || '', l.action || '', l.detail || '', '', '', '', l.ip || '']);
        const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replaceAll('"', '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'activity.csv'; a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div>
            <h1 className="text-3xl font-bold text-white mb-6">Activity tracker</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Start date</div><input type="datetime-local" className="search-input w-full rounded-md px-2 py-1" value={filters.start} onChange={e => set('start', e.target.value)} /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">End date</div><input type="datetime-local" className="search-input w-full rounded-md px-2 py-1" value={filters.end} onChange={e => set('end', e.target.value)} /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Category</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Order" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">PC</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.pc} onChange={e => set('pc', e.target.value)} placeholder="id or name" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">Employee</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.employee} onChange={e => set('employee', e.target.value)} placeholder="name or id" /></div>
                <div className="card-animated p-3"><div className="text-xs text-gray-400 mb-1">User</div><input className="search-input w-full rounded-md px-2 py-1" value={filters.user} onChange={e => set('user', e.target.value)} placeholder="name or id" /></div>
            </div>
            <div className="flex items-center gap-2 mb-3">
                <button className="pill" onClick={fetchLogs}>Apply</button>
                <button className="pill" onClick={() => { setFilters({ start: '', end: '', category: '', pc: '', employee: '', user: '' }); }}>Reset</button>
                <button className="btn-primary-neo px-3 py-1.5 rounded-md" onClick={exportCsv}>Export CSV</button>
            </div>
            <div className="card-animated overflow-hidden">
                <table className="w-full text-left text-gray-300">
                    <thead className="bg-white/5 text-gray-400 text-xs uppercase">
                        <tr>
                            <th className="p-3">DAY / TIME</th>
                            <th className="p-3">USERNAME</th>
                            <th className="p-3">ACTION</th>
                            <th className="p-3">DETAILS</th>
                            <th className="p-3">AMOUNT</th>
                            <th className="p-3">COINS</th>
                            <th className="p-3">PC</th>
                            <th className="p-3">SOURCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (<tr><td className="p-6 text-gray-500" colSpan={8}>Loading...</td></tr>)}
                        {!loading && logs.length === 0 && (<tr><td className="p-6 text-gray-500" colSpan={8}>No records available.</td></tr>)}
                        {!loading && logs.map((l, i) => (
                            <tr key={i} className="border-t border-white/10">
                                <td className="p-3">{l.timestamp}</td>
                                <td className="p-3">{l.user_id || '-'}</td>
                                <td className="p-3">{l.action}</td>
                                <td className="p-3">{l.detail}</td>
                                <td className="p-3">-</td>
                                <td className="p-3">-</td>
                                <td className="p-3">-</td>
                                <td className="p-3">{l.ip || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// StatisticsPage is defined in ./StatisticsPage.jsx (imported above)


// Main App Component
const AdminUI = ({ cafeInfo, onLogout }) => {
    const [activePage, setActivePage] = useState('Dashboard');
    const [activeChatContext, setActiveChatContext] = useState(null);

    const NavItem = ({ pageName, icon, children }) => (
        <li
            onClick={() => setActivePage(pageName)}
            className={`nav-neo ${activePage === pageName ? 'nav-neo-active text-white' : 'text-gray-300'} flex items-center space-x-3 p-3 rounded-lg cursor-pointer`}
        >
            <span className="text-gray-200">{icon}</span>
            <span className="font-medium">{children}</span>
        </li>
    );

    const renderPage = () => {
        switch (activePage) {
            case 'Dashboard': return <Dashboard />;
            case 'PCs':
            case 'PC list':
                return <PCManagement />;
            case 'Users': return <UsersPage />;
            case 'Games': return <GameManagement />;
            case 'Financials': return <Financials />;
            case 'Shop': return <ShopPage cafeInfo={cafeInfo} />;
            case 'Coupons': return <CouponsPage cafeInfo={cafeInfo} />;
            case 'Campaigns': return <CampaignsPage cafeInfo={cafeInfo} />;
            case 'Orders': return <OrdersPage />;
            case 'Bookings': return <BookingsPage />;
            case 'Guests': return <GuestsPage />;
            case 'Statistics': return <StatisticsPage />;
            case 'Activity tracker': return <ActivityPage />;
            case 'Settings': return <Settings />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className="admin-shell text-white min-h-screen flex font-sans">
            {/* Sidebar */}
            <aside className="w-64 sidebar-glass p-6 flex-shrink-0 flex flex-col justify-between">
                <div>
                    <div className="flex items-center space-x-3 mb-10">
                        <Annoyed size={32} className="text-indigo-400 drop-shadow-[0_0_12px_rgba(147,51,234,0.6)]" />
                        <h1 className="text-2xl font-extrabold title-gradient">PRIMUS</h1>
                    </div>
                    <nav>
                        <ul className="space-y-2">
                            <NavItem pageName="Dashboard" icon={<BarChart size={20} />}>Dashboard</NavItem>
                            <NavItem pageName="PC list" icon={<Monitor size={20} />}>PC list</NavItem>
                            <NavItem pageName="Shop" icon={<ShoppingCart size={20} />}>Shop</NavItem>
                            <NavItem pageName="Coupons" icon={<Ticket size={20} />}>Coupons</NavItem>
                            <NavItem pageName="Campaigns" icon={<Megaphone size={20} />}>Campaigns</NavItem>
                            <NavItem pageName="Orders" icon={<Ticket size={20} />}>Orders</NavItem>
                            <NavItem pageName="Users" icon={<Users size={20} />}>Users</NavItem>
                            <NavItem pageName="Guests" icon={<Annoyed size={20} />}>Guests</NavItem>
                            <NavItem pageName="Bookings" icon={<Calendar size={20} />}>Bookings</NavItem>
                            <NavItem pageName="Activity tracker" icon={<Clock size={20} />}>Activity tracker</NavItem>
                            <NavItem pageName="Statistics" icon={<BarChart size={20} />}>Statistics</NavItem>
                            <NavItem pageName="Settings" icon={<SettingsIcon size={20} />}>Settings</NavItem>
                        </ul>
                    </nav>
                </div>
                <div>
                    <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-700/50">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-lg">
                            {cafeInfo?.name?.charAt(0) || 'A'}
                        </div>
                        <div>
                            <p className="font-semibold text-white">{cafeInfo?.name || 'Cafe Admin'}</p>
                            <p className="text-xs text-gray-400">{cafeInfo?.location || 'admin@cafe.com'}</p>
                        </div>
                    </div>
                    <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 p-3 mt-4 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-300 transition-colors">
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-y-auto">
                {/* Header */}
                <header className="flex justify-between items-center mb-8">
                    <div className="relative w-full max-w-xs">
                        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search for PCs, users..."
                            className="w-full search-input rounded-lg py-2 pl-10 pr-4 text-white placeholder-gray-500"
                        />
                    </div>
                    <div className="flex items-center space-x-6">
                        <NotificationBell
                            onOpenThread={(ctx) => {
                                setActiveChatContext(ctx);
                            }}
                        />
                    </div>
                </header>

                {/* Page Content */}
                {renderPage()}
                {activeChatContext && (
                    <ChatPanel
                        pc={{
                            id: activeChatContext.client_id,
                            name: activeChatContext.client_name || `PC-${activeChatContext.client_id}`,
                        }}
                        onClose={() => setActiveChatContext(null)}
                    />
                )}
            </main>
        </div>
    );
};

const App = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('primus_jwt'));
    const [cafeInfo, setCafeInfo] = useState(null);

    const fetchCafeInfo = useCallback(async () => {
        try {
            const base = getApiBase().replace(/\/$/, "");
            const r = await axios.get(`${base}/api/cafe/mine`, { headers: authHeaders() });
            setCafeInfo(r.data);
        } catch (e) {
            if (e.response?.status === 401) {
                localStorage.removeItem('primus_jwt');
                setIsLoggedIn(false);
            }
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn) {
            fetchCafeInfo();
            eventStream.connect();
        } else {
            eventStream.disconnect();
        }
        return () => eventStream.disconnect();
    }, [isLoggedIn, fetchCafeInfo]);

    if (!isLoggedIn) {
        return <Login onLoginSuccess={() => setIsLoggedIn(true)} />;
    }

    return (
        <AdminUI
            cafeInfo={cafeInfo}
            onLogout={() => {
                localStorage.removeItem('primus_jwt');
                setIsLoggedIn(false);
            }}
        />
    );
};

App.propTypes = {
    cafeInfo: PropTypes.object,
    onLogout: PropTypes.func.isRequired
};

export default App;

// --- Settings Implementation ---

// Placeholder component for settings pages that aren't implemented yet
function PlaceholderPage({ title }) {
    return (
        <div className="text-center py-16">
            <div className="text-xl text-white font-semibold mb-4">{title}</div>
            <div className="text-gray-400 mb-6">This settings page is ready to be configured.</div>
            <div className="text-gray-500 text-sm">Let me know what settings you'd like to add to this section!</div>
        </div>
    );
}

// Client Configuration Components
function ClientGeneral() {
    const [generalSettings, setGeneralSettings] = useState({
        pc_idle_timeout_hours: 0,
        pc_idle_timeout_minutes: 0,
        pc_idle_timeout_seconds: 0,
        gdpr_enabled: false,
        gdpr_age_level: 16,
        profile_access_enabled: true,
        profile_general_info: true,
        profile_see_offers: true,
        profile_edit_credentials: true,
        logout_action: 'do_nothing',
        hide_home_screen: false,
        enable_events: true,
        clock_enabled: false,
        allow_force_logout: true,
        default_login: true,
        manual_account_creation: true,
        free_time_assigned: false,
        free_time_days: 0,
        free_time_hours: 1,
        free_time_minutes: 0,
        persistent_lock: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadClientGeneralSettings();
    }, []);

    const loadClientGeneralSettings = async () => {
        try {
            let settings = await settingsAPI.getSettingsByCategory('client_general');

            // If no settings exist, initialize defaults
            if (!settings || settings.length === 0) {
                try {
                    const base = getApiBase().replace(/\/$/, "");
                    const response = await fetch(`${base}/api/settings/initialize-defaults`, {
                        method: 'POST',
                        headers: authHeaders()
                    });
                    if (response.ok) {
                        showToast('Default settings initialized');
                        // Reload settings after initialization
                        settings = await settingsAPI.getSettingsByCategory('client_general');
                    }
                } catch (initError) {
                    console.log('Could not initialize defaults (might not have permissions)');
                }
            }

            const settingsObj = settingsToObject(settings);
            setGeneralSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load client general settings');
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = (key, value) => {
        // Ensure numeric values are properly typed
        if (key.includes('timeout_') && ['hours', 'minutes', 'seconds'].some(t => key.includes(t))) {
            value = parseInt(value) || 0;
        } else if (key.includes('free_time_') && ['days', 'hours', 'minutes'].some(t => key.includes(t))) {
            value = parseInt(value) || 0;
        } else if (key === 'gdpr_age_level') {
            value = parseInt(value) || 16;
        }

        setGeneralSettings(prev => ({ ...prev, [key]: value }));
    };

    const saveClientGeneralSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(generalSettings, 'client_general');

            // Add descriptions for better debugging
            const settingsWithDescriptions = settingsArray.map(setting => ({
                ...setting,
                description: setting.description || `Client general setting: ${setting.key}`
            }));

            // Validate timeout values
            const totalSeconds = (generalSettings.pc_idle_timeout_hours * 3600) +
                (generalSettings.pc_idle_timeout_minutes * 60) +
                generalSettings.pc_idle_timeout_seconds;

            if (totalSeconds > 86400) { // 24 hours max
                showToast('PC idle timeout cannot exceed 24 hours');
                setSaving(false);
                return;
            }

            // Validate free time values
            if (generalSettings.free_time_assigned) {
                const totalFreeTime = (generalSettings.free_time_days * 86400) +
                    (generalSettings.free_time_hours * 3600) +
                    (generalSettings.free_time_minutes * 60);

                if (totalFreeTime === 0) {
                    showToast('Please specify at least some free time when enabled');
                    setSaving(false);
                    return;
                }

                if (totalFreeTime > 2592000) { // 30 days max
                    showToast('Free time cannot exceed 30 days');
                    setSaving(false);
                    return;
                }
            }

            console.log('Saving settings:', settingsWithDescriptions);
            const result = await settingsAPI.bulkUpdateSettings(settingsWithDescriptions);
            console.log('Save result:', result);
            showToast('Client general settings saved successfully');
        } catch (error) {
            console.error('Save error:', error);
            showToast('Failed to save client general settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/General settings
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/General settings</div>

            {/* PC Idle timeout */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">PC Idle timeout</div>
                <div className="text-gray-400 text-sm mb-4">Choose if a pc should automatically turn off after a period of being idle (without a user logged in)</div>
                <div className="grid grid-cols-3 gap-4">
                    <Field label="Hours">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_hours} onChange={e => updateSetting('pc_idle_timeout_hours', parseInt(e.target.value))}>
                            {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                    <Field label="Minutes">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_minutes} onChange={e => updateSetting('pc_idle_timeout_minutes', parseInt(e.target.value))}>
                            {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                    <Field label="Seconds">
                        <select className="search-input w-full rounded-md px-3 py-2" value={generalSettings.pc_idle_timeout_seconds} onChange={e => updateSetting('pc_idle_timeout_seconds', parseInt(e.target.value))}>
                            {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                    </Field>
                </div>
            </div>

            {/* GDPR */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Current GDPR</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.gdpr_enabled} onChange={value => updateSetting('gdpr_enabled', value)} />
                    <span className="text-white">GDPR</span>
                </div>

                {generalSettings.gdpr_enabled && (
                    <div>
                        <div className="text-white mb-2">GDPR age level</div>
                        <div className="flex space-x-4">
                            {[13, 14, 15, 16].map(age => (
                                <label key={age} className="flex items-center space-x-2 text-white">
                                    <input
                                        type="radio"
                                        name="gdpr_age"
                                        value={age}
                                        checked={generalSettings.gdpr_age_level === age}
                                        onChange={() => updateSetting('gdpr_age_level', age)}
                                        className="text-purple-500"
                                    />
                                    <span>{age}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Profile access */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Profile access</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.profile_access_enabled} onChange={value => updateSetting('profile_access_enabled', value)} />
                    <span className="text-white">Allow profile access to the users</span>
                </div>

                {generalSettings.profile_access_enabled && (
                    <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_general_info} onChange={value => updateSetting('profile_general_info', value)} />
                            <span className="text-white">General information</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_see_offers} onChange={value => updateSetting('profile_see_offers', value)} />
                            <span className="text-white">See offers</span>
                        </div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.profile_edit_credentials} onChange={value => updateSetting('profile_edit_credentials', value)} />
                            <span className="text-white">Edit credentials</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Client logout button action */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Client logout button action</div>
                <div className="space-y-2">
                    {[
                        { value: 'do_nothing', label: 'Do nothing' },
                        { value: 'windows_logout', label: 'Windows logout' },
                        { value: 'reboot_pc', label: 'Reboot PC' },
                        { value: 'turn_off_pc', label: 'Turn off PC' },
                        { value: 'lock_pc', label: 'Lock PC' }
                    ].map(option => (
                        <label key={option.value} className="flex items-center space-x-2 text-white">
                            <input
                                type="radio"
                                name="logout_action"
                                value={option.value}
                                checked={generalSettings.logout_action === option.value}
                                onChange={() => updateSetting('logout_action', option.value)}
                                className="text-purple-500"
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Additional toggles */}
            <div className="settings-card p-4 mb-4">
                <div className="space-y-4">
                    <div>
                        <div className="text-lg text-white font-medium mb-2">Hide home screen</div>
                        <div className="text-gray-400 text-sm mb-2">Users will directly go to Games screen right after login, and hides the home screen.</div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.hide_home_screen} onChange={value => updateSetting('hide_home_screen', value)} />
                            <span className="text-white">Hide home screen</span>
                        </div>
                    </div>

                    <div>
                        <div className="text-lg text-white font-medium mb-2">Enable events</div>
                        <div className="text-gray-400 text-sm mb-2">Enable or disable Arcade events for your center.</div>
                        <div className="flex items-center space-x-3">
                            <Toggle value={generalSettings.enable_events} onChange={value => updateSetting('enable_events', value)} />
                            <span className="text-white">Enable events</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Other settings */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-3">Other settings</div>
                <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            checked={generalSettings.clock_enabled}
                            onChange={e => updateSetting('clock_enabled', e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-white">Clock enabled</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <input
                            type="checkbox"
                            checked={generalSettings.allow_force_logout}
                            onChange={e => updateSetting('allow_force_logout', e.target.checked)}
                            className="w-4 h-4"
                        />
                        <span className="text-white">Allow force logout</span>
                    </div>
                </div>
            </div>

            {/* Login method */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Login method</div>
                <div className="text-gray-400 text-sm mb-3">Select the methods the user will be able to use to log in to the client. You can find the rest of the methods created as add-ons in the 'Add-Ons Marketplace' section.</div>
                <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                        <Toggle value={generalSettings.default_login} onChange={value => updateSetting('default_login', value)} />
                        <span className="text-white">Default login</span>
                    </div>
                    <div className="flex items-center space-x-3">
                        <Toggle value={generalSettings.manual_account_creation} onChange={value => updateSetting('manual_account_creation', value)} />
                        <span className="text-white">Manual account creation at PC</span>
                    </div>
                </div>
            </div>

            {/* Free time assigned */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Free time assigned to account</div>
                <div className="text-gray-400 text-sm mb-4">Automatically award every new customer who registers at the gaming pc, with an amount of initial free gaming time (e.g first hour is free!)</div>
                <div className="flex items-center space-x-3 mb-4">
                    <Toggle value={generalSettings.free_time_assigned} onChange={value => updateSetting('free_time_assigned', value)} />
                    <span className="text-white">Free time assigned to account</span>
                </div>

                {generalSettings.free_time_assigned && (
                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <Field label="Free days">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_days}
                                onChange={e => updateSetting('free_time_days', parseInt(e.target.value))}
                            >
                                {[...Array(31)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                        <Field label="Free hours">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_hours}
                                onChange={e => updateSetting('free_time_hours', parseInt(e.target.value))}
                            >
                                {[...Array(24)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                        <Field label="Free minutes">
                            <select
                                className="search-input w-full rounded-md px-3 py-2"
                                value={generalSettings.free_time_minutes}
                                onChange={e => updateSetting('free_time_minutes', parseInt(e.target.value))}
                            >
                                {[...Array(60)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </Field>
                    </div>
                )}
            </div>

            {/* Persistent lock */}
            <div className="settings-card p-4 mb-6">
                <div className="text-lg text-white font-medium mb-2">Persistent lock</div>
                <div className="flex items-center space-x-3">
                    <Toggle value={generalSettings.persistent_lock} onChange={value => updateSetting('persistent_lock', value)} />
                    <span className="text-white">Keep PC locked after reboot</span>
                </div>
            </div>

            {/* Save button */}
            <div className="mt-6">
                <button
                    className="settings-button-primary rounded-md px-4 py-2"
                    onClick={saveClientGeneralSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function ClientVersion() {
    const [versionSettings, setVersionSettings] = useState({
        latest_stable: '3.0.1467.0',
        latest_beta: '3.0.1481.0',
        latest_alpha: '3.0.1503.0',
        current_versions: ['vaishwik Version: 3.0.1481.0 (Beta)']
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadVersionSettings();
    }, []);

    const loadVersionSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_version');
            const settingsObj = settingsToObject(settings);
            setVersionSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load version settings');
        } finally {
            setLoading(false);
        }
    };

    const saveVersionSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(versionSettings, 'client_version');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Version settings saved successfully');
        } catch (error) {
            showToast('Failed to save version settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Version
                <div className="text-gray-400 text-sm mt-2">Loading version settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Version</div>

            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Primus version settings</div>
                <div className="text-gray-400 text-sm mb-4">
                    Client versions setting will determine the version of Primus software running on your gaming PCs. Stable is the minimum version that is supported. Beta versions will have been tested in dozens of centers, and alpha versions are very new. We recommend testing beta/alpha versions on a small number of PCs initially.
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <div className="text-blue-400 cursor-pointer hover:text-blue-300">
                        <div className="flex items-center space-x-2 mb-1">
                            <span>📋</span>
                            <span>View latest changelog</span>
                        </div>
                    </div>
                    <div className="text-blue-400 cursor-pointer hover:text-blue-300">
                        <div className="flex items-center space-x-2 mb-1">
                            <span>📋</span>
                            <span>How to update your PCs</span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                            <div className="text-gray-400 mb-1">LATEST STABLE VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_stable}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 mb-1">LATEST BETA VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_beta}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 mb-1">LATEST ALPHA VERSION</div>
                            <div className="text-white font-medium">{versionSettings.latest_alpha}</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    {Array.isArray(versionSettings.current_versions) ?
                        versionSettings.current_versions.map((version, index) => (
                            <div key={index} className="flex items-center space-x-3">
                                <input type="checkbox" className="w-4 h-4 text-purple-500" />
                                <span className="text-white">{version}</span>
                            </div>
                        )) :
                        <div className="flex items-center space-x-3">
                            <input type="checkbox" className="w-4 h-4 text-purple-500" />
                            <span className="text-white">vaishwik Version: 3.0.1481.0 (Beta)</span>
                        </div>
                    }
                </div>

                <div className="flex space-x-3 mt-4">
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Change version</button>
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Select all</button>
                    <button className="settings-button rounded-md px-4 py-2 hover:bg-gray-600">Clear all</button>
                </div>

                <div className="mt-6">
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={saveVersionSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ClientConsoles() {
    const [consoleSettings, setConsoleSettings] = useState({
        consoles: [],
        auto_logout_enabled: true
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);

    useEffect(() => {
        loadConsoleSettings();
    }, []);

    const loadConsoleSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_consoles');
            const settingsObj = settingsToObject(settings);
            setConsoleSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load console settings');
        } finally {
            setLoading(false);
        }
    };

    const saveConsoleSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(consoleSettings, 'client_consoles');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Console settings saved successfully');
        } catch (error) {
            showToast('Failed to save console settings');
        } finally {
            setSaving(false);
        }
    };

    const addConsole = (consoleName) => {
        const newConsole = {
            id: Date.now(),
            name: consoleName,
            enabled: true
        };
        setConsoleSettings(prev => ({
            ...prev,
            consoles: Array.isArray(prev.consoles) ? [...prev.consoles, newConsole] : [newConsole]
        }));
        setShowAddModal(false);
    };

    const removeConsole = (consoleId) => {
        setConsoleSettings(prev => ({
            ...prev,
            consoles: Array.isArray(prev.consoles) ? prev.consoles.filter(c => c.id !== consoleId) : []
        }));
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Consoles
                <div className="text-gray-400 text-sm mt-2">Loading console settings...</div>
            </div>
        );
    }

    const consoles = Array.isArray(consoleSettings.consoles) ? consoleSettings.consoles : [];

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Consoles</div>

            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Consoles</div>
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={() => setShowAddModal(true)}
                    >
                        + Add console
                    </button>
                </div>

                {consoles.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">🎮</div>
                        <div className="text-white font-medium text-lg mb-2">No consoles found!</div>
                        <div className="text-gray-400 mb-4">Click on the button below to add the console</div>
                        <button
                            className="settings-button rounded-md px-4 py-2"
                            onClick={() => setShowAddModal(true)}
                        >
                            Add console
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {consoles.map((console, index) => (
                            <div key={index} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                                <div className="text-white">{console.name}</div>
                                <button
                                    className="text-red-400 hover:text-red-300 text-sm"
                                    onClick={() => removeConsole(console.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <div className="flex items-center space-x-3">
                        <Toggle
                            value={consoleSettings.auto_logout_enabled}
                            onChange={(value) => setConsoleSettings(prev => ({ ...prev, auto_logout_enabled: value }))}
                        />
                        <div className="text-white">
                            <div className="font-medium">Auto logout users from consoles</div>
                            <div className="text-gray-400 text-sm">Automatically log out users from console sessions when idle</div>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        className="settings-button-primary rounded-md px-4 py-2"
                        onClick={saveConsoleSettings}
                        disabled={saving}
                    >
                        {saving ? 'Saving...' : 'Save changes'}
                    </button>
                </div>
            </div>

            {/* Add Console Modal */}
            {showAddModal && (
                <AddConsoleModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={addConsole}
                />
            )}
        </div>
    );
}

function AddConsoleModal({ onClose, onAdd }) {
    const [consoleName, setConsoleName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (consoleName.trim()) {
            onAdd(consoleName.trim());
            setConsoleName('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl" style={{ background: '#1a1d21', border: '1px solid #2a2d31' }}>
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-white font-semibold">Add Console</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-4">
                    <div className="mb-4">
                        <label className="text-gray-400 text-sm mb-2 block">Console Name</label>
                        <input
                            type="text"
                            value={consoleName}
                            onChange={(e) => setConsoleName(e.target.value)}
                            className="search-input w-full rounded-md px-3 py-2"
                            placeholder="e.g., PlayStation 5, Xbox Series X"
                            autoFocus
                        />
                    </div>
                    <div className="flex space-x-3">
                        <button
                            type="submit"
                            className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            disabled={!consoleName.trim()}
                        >
                            Add Console
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="settings-button rounded-md px-4 py-2"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ClientCustomization() {
    const [customizationSettings, setCustomizationSettings] = useState({
        center_logo: null,
        logged_out_background_type: 'video',
        logged_out_video_background: '/videos/sample-video1.mp4',
        logged_out_image_background: null,
        logged_in_background_type: 'video',
        logged_in_video_background: '/videos/sample-video2.mp4',
        logged_in_image_background: null,
        selected_theme: 'sea_blue',
        custom_theme_primary: '#4F46E5',
        custom_theme_secondary: '#7C3AED'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [logoPreview, setLogoPreview] = useState(null);

    useEffect(() => {
        loadCustomizationSettings();
    }, []);

    const loadCustomizationSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_customization');
            const settingsObj = settingsToObject(settings);
            setCustomizationSettings(prev => ({ ...prev, ...settingsObj }));
            if (settingsObj.center_logo) {
                setLogoPreview(settingsObj.center_logo);
            }
        } catch (error) {
            showToast('Failed to load customization settings');
        } finally {
            setLoading(false);
        }
    };

    const saveCustomizationSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(customizationSettings, 'client_customization');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Customization settings saved successfully');
        } catch (error) {
            showToast('Failed to save customization settings');
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Logo file must be less than 5MB');
            return;
        }

        // Convert to base64 for preview
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result;
            setLogoPreview(base64);
            setCustomizationSettings(prev => ({ ...prev, center_logo: base64 }));
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoPreview(null);
        setCustomizationSettings(prev => ({ ...prev, center_logo: null }));
    };

    const updateSetting = (key, value) => {
        setCustomizationSettings(prev => ({ ...prev, [key]: value }));
    };

    const colorThemes = [
        { id: 'sea_blue', name: 'Sea blue', color: '#3B82F6' },
        { id: 'ufo_green', name: 'UFO green', color: '#10B981' },
        { id: 'fire_red', name: 'Fire red', color: '#EF4444' },
        { id: 'duo_ggcircuit', name: 'Duo ggCircuit', gradient: 'linear-gradient(135deg, #10B981 0%, #7C3AED 100%)' },
        { id: 'duo_egl', name: 'Duo EGL', gradient: 'linear-gradient(135deg, #F59E0B 0%, #1F2937 100%)' },
        { id: 'custom_theme', name: 'Custom theme', color: '#4F46E5', customizable: true }
    ];

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Customization
                <div className="text-gray-400 text-sm mt-2">Loading customization settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Customization</div>

            {/* Center Logo */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Center logo</div>
                <div className="text-gray-400 text-sm mb-4">To get a better-looking client, we allow only .png file and strongly recommend using a transparent background.</div>

                <div className="mb-4">
                    <div className="text-white text-sm mb-2">Example</div>
                    <div className="flex space-x-4 mb-4">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center mb-2">
                                <span className="text-white text-xs">✓</span>
                            </div>
                            <span className="text-green-400 text-xs">Good</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center mb-2">
                                <span className="text-black text-xs">✗</span>
                            </div>
                            <span className="text-red-400 text-xs">Bad</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {logoPreview ? (
                        <div className="relative">
                            <img src={logoPreview} alt="Logo preview" className="w-32 h-32 object-contain bg-gray-800 rounded-lg border-2 border-dashed border-gray-600" />
                            <button
                                onClick={removeLogo}
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <div className="w-32 h-32 border-2 border-dashed border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400">
                            <span className="text-2xl mb-2">📸</span>
                            <span className="text-xs text-center">No logo</span>
                        </div>
                    )}

                    <div className="flex flex-col space-y-2">
                        <label className="settings-button-primary rounded-md px-4 py-2 cursor-pointer">
                            Change center logo
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                        </label>
                        <button
                            onClick={removeLogo}
                            className="settings-button rounded-md px-4 py-2"
                            disabled={!logoPreview}
                        >
                            Remove center logo
                        </button>
                    </div>
                </div>
            </div>

            {/* PC Group Background Customization */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">PC group Primus background customization</div>
                <div className="text-gray-400 text-sm mb-4">With these settings, you will be able to customize the backgrounds across the Primus UI and customize different PC groups.</div>

                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-white font-medium">General Systems</span>
                        <button className="settings-button rounded-md px-3 py-1 text-sm">⚙️ PC Group settings</button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Logged out */}
                        <div>
                            <div className="text-white font-medium mb-3">Logged out</div>
                            <div className="text-gray-400 text-sm mb-3">Background type</div>
                            <div className="flex space-x-4 mb-4">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_out_bg"
                                        value="video"
                                        checked={customizationSettings.logged_out_background_type === 'video'}
                                        onChange={() => updateSetting('logged_out_background_type', 'video')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Video background</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_out_bg"
                                        value="image"
                                        checked={customizationSettings.logged_out_background_type === 'image'}
                                        onChange={() => updateSetting('logged_out_background_type', 'image')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Image background</span>
                                </label>
                            </div>

                            <div className="text-gray-400 text-sm mb-2">Select video background</div>
                            <div className="relative">
                                <video
                                    className="w-full h-32 object-cover rounded-lg bg-gray-900"
                                    poster="/images/video-poster1.jpg"
                                    muted
                                >
                                    <source src={customizationSettings.logged_out_video_background} type="video/mp4" />
                                </video>
                                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-2xl">▶️</span>
                                </div>
                            </div>
                        </div>

                        {/* Logged in */}
                        <div>
                            <div className="text-white font-medium mb-3">Logged in</div>
                            <div className="text-gray-400 text-sm mb-3">Background type</div>
                            <div className="flex space-x-4 mb-4">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_in_bg"
                                        value="video"
                                        checked={customizationSettings.logged_in_background_type === 'video'}
                                        onChange={() => updateSetting('logged_in_background_type', 'video')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Video background</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="radio"
                                        name="logged_in_bg"
                                        value="image"
                                        checked={customizationSettings.logged_in_background_type === 'image'}
                                        onChange={() => updateSetting('logged_in_background_type', 'image')}
                                        className="text-purple-500"
                                    />
                                    <span className="text-white">Image background</span>
                                </label>
                            </div>

                            <div className="text-gray-400 text-sm mb-2">Select video background</div>
                            <div className="relative">
                                <video
                                    className="w-full h-32 object-cover rounded-lg bg-gray-900"
                                    poster="/images/video-poster2.jpg"
                                    muted
                                >
                                    <source src={customizationSettings.logged_in_video_background} type="video/mp4" />
                                </video>
                                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-2xl">▶️</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Color Customization */}
            <div className="settings-card p-4 mb-4">
                <div className="text-lg text-white font-medium mb-2">Color customization (Only for Primus client 3.0)</div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {colorThemes.map(theme => (
                        <button
                            key={theme.id}
                            className={`relative p-4 rounded-lg border-2 transition-all ${customizationSettings.selected_theme === theme.id
                                ? 'border-purple-500 ring-2 ring-purple-500/50'
                                : 'border-gray-600 hover:border-gray-500'
                                }`}
                            onClick={() => updateSetting('selected_theme', theme.id)}
                        >
                            <div
                                className="w-full h-16 rounded-lg mb-2"
                                style={{
                                    background: theme.gradient || theme.color,
                                }}
                            >
                                {theme.customizable && (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-white text-lg">🎨</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-white text-sm font-medium">{theme.name}</div>
                        </button>
                    ))}
                </div>

                <div className="flex justify-center mb-6">
                    <button className="settings-button rounded-lg px-6 py-3">Apply theme</button>
                </div>

                {/* Client Preview */}
                <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                    <div className="relative h-80">
                        <img
                            src="/images/client-preview-bg.jpg"
                            alt="Client preview"
                            className="w-full h-full object-cover"
                        />

                        {/* Logo overlay */}
                        <div className="absolute top-4 left-4">
                            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-2 flex items-center space-x-2">
                                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs">GG</span>
                                </div>
                                <span className="text-white font-bold">CIRCUIT</span>
                            </div>
                        </div>

                        {/* Game grid overlay */}
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                            <span className="text-white bg-black/50 px-2 py-1 rounded text-sm">Games</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Apps</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Shop</span>
                            <span className="text-gray-300 bg-black/30 px-2 py-1 rounded text-sm">Prize Vault</span>
                        </div>

                        {/* Game cards */}
                        <div className="absolute top-16 left-4 grid grid-cols-3 gap-2">
                            {['RAINBOW SIX', 'Cars 3', 'Fortnite', 'Cars 2', 'Apex Legends', 'The Witcher'].map((game, index) => (
                                <div key={index} className="w-20 h-20 bg-gray-800/80 rounded-lg flex items-center justify-center">
                                    <span className="text-white text-xs text-center">{game}</span>
                                </div>
                            ))}
                        </div>

                        {/* Side panels */}
                        <div className="absolute top-4 right-4 w-64 space-y-4">
                            <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4">
                                <h3 className="text-white font-bold mb-2">Book your next gaming session</h3>
                                <p className="text-gray-300 text-sm mb-3">Scan the QR with your phone and you can complete your next visit.</p>
                                <div className="w-16 h-16 bg-white rounded-lg mx-auto"></div>
                            </div>

                            <div className="bg-teal-500/90 backdrop-blur-sm rounded-lg p-4">
                                <div className="text-center">
                                    <div className="text-white text-2xl font-bold">5</div>
                                    <div className="text-white text-sm">HOURS</div>
                                    <div className="text-white text-xs">5 hours GamePass</div>
                                    <div className="text-white text-xs">Add 5 hours to your GamePass wallet</div>
                                </div>
                            </div>

                            <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-3">
                                <h4 className="text-white font-medium mb-2">Social</h4>
                                <div className="space-y-1 text-xs text-gray-300">
                                    <div>🎮 GTVietnam just got a Fortnite Winner Royale</div>
                                    <div>⚡ GTVietnam has accepted your invitation to connect</div>
                                    <div>🎮 arcanerwar just spent 5,000 coins on a free day pass!</div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom navigation */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                            <button className="bg-gray-700/80 text-white px-4 py-2 rounded-lg text-sm">◀ Client login</button>
                            <button className="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Client home</button>
                            <button className="bg-gray-700/80 text-white px-4 py-2 rounded-lg text-sm">▶</button>
                        </div>

                        {/* User info overlay */}
                        <div className="absolute top-4 right-4">
                            <span className="text-white text-sm">🎮 PRIME01 📍 1</span>
                            <span className="text-white text-sm ml-4">⏰ 10:17</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Save button */}
            <div className="mt-6">
                <button
                    className="settings-button-primary rounded-md px-4 py-2"
                    onClick={saveCustomizationSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function ClientAdvanced() {
    const [advancedSettings, setAdvancedSettings] = useState({
        startup_commands: [],
        client_applications: [],
        whitelisted_apps: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddCommand, setShowAddCommand] = useState(false);
    const [showAddApplication, setShowAddApplication] = useState(false);
    const [showAddWhitelistedApp, setShowAddWhitelistedApp] = useState(false);

    // Modal states
    const [newCommand, setNewCommand] = useState({
        full_path: '',
        parameter: '',
        working_directory: '',
        run_in_cmd: false,
        trigger_type: 'Startup',
        long_running: false
    });

    const [newApplication, setNewApplication] = useState({
        name: '',
        path: '',
        parameters: ''
    });

    const [newWhitelistedApp, setNewWhitelistedApp] = useState({
        process_name: ''
    });

    useEffect(() => {
        loadAdvancedSettings();
    }, []);

    const loadAdvancedSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_advanced');
            const settingsObj = settingsToObject(settings);
            setAdvancedSettings(prev => ({ ...prev, ...settingsObj }));
        } catch (error) {
            showToast('Failed to load advanced settings');
        } finally {
            setLoading(false);
        }
    };

    const saveAdvancedSettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(advancedSettings, 'client_advanced');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Advanced settings saved successfully');
        } catch (error) {
            showToast('Failed to save advanced settings');
        } finally {
            setSaving(false);
        }
    };

    const addCommand = () => {
        if (!newCommand.full_path.trim()) {
            showToast('Full path is required');
            return;
        }

        const command = {
            id: Date.now(),
            ...newCommand
        };

        setAdvancedSettings(prev => ({
            ...prev,
            startup_commands: [...prev.startup_commands, command]
        }));

        setNewCommand({
            full_path: '',
            parameter: '',
            working_directory: '',
            run_in_cmd: false,
            trigger_type: 'Startup',
            long_running: false
        });
        setShowAddCommand(false);
        showToast('Command added successfully');
    };

    const removeCommand = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            startup_commands: prev.startup_commands.filter(cmd => cmd.id !== id)
        }));
        showToast('Command removed');
    };

    const addApplication = () => {
        if (!newApplication.name.trim() || !newApplication.path.trim()) {
            showToast('Name and path are required');
            return;
        }

        const application = {
            id: Date.now(),
            ...newApplication
        };

        setAdvancedSettings(prev => ({
            ...prev,
            client_applications: [...prev.client_applications, application]
        }));

        setNewApplication({
            name: '',
            path: '',
            parameters: ''
        });
        setShowAddApplication(false);
        showToast('Application added successfully');
    };

    const removeApplication = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            client_applications: prev.client_applications.filter(app => app.id !== id)
        }));
        showToast('Application removed');
    };

    const addWhitelistedApp = () => {
        if (!newWhitelistedApp.process_name.trim()) {
            showToast('Process name is required');
            return;
        }

        const app = {
            id: Date.now(),
            ...newWhitelistedApp
        };

        setAdvancedSettings(prev => ({
            ...prev,
            whitelisted_apps: [...prev.whitelisted_apps, app]
        }));

        setNewWhitelistedApp({
            process_name: ''
        });
        setShowAddWhitelistedApp(false);
        showToast('Whitelisted app added successfully');
    };

    const removeWhitelistedApp = (id) => {
        setAdvancedSettings(prev => ({
            ...prev,
            whitelisted_apps: prev.whitelisted_apps.filter(app => app.id !== id)
        }));
        showToast('Whitelisted app removed');
    };

    const triggerTypes = ['Startup', 'User login', 'Guest login', 'Logout', 'App launch'];

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Advanced
                <div className="text-gray-400 text-sm mt-2">Loading advanced settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Advanced</div>

            {/* Startup Commands */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-lg text-white font-medium mb-2">Startup</div>
                        <div className="text-gray-400 text-sm">
                            Specify commands that Primus will run on each client on selected trigger type event. This can be used to copy network files, run local batch files, etc.
                        </div>
                        <div className="text-gray-400 text-sm mt-1">
                            Commands are run in the order they appear below. Currently, a client receives the startup commands on startup, but must be restarted once more before they will execute for the first time.
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddCommand(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add command</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-12 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div className="col-span-2">FULL PATH</div>
                        <div className="col-span-2">PARAMETER</div>
                        <div className="col-span-2">WORKING DIRECTORY</div>
                        <div className="col-span-1">RUN IN CMD</div>
                        <div className="col-span-2">TRIGGER TYPE</div>
                        <div className="col-span-2">LONG RUNNING</div>
                        <div className="col-span-1">ACTIONS</div>
                    </div>

                    {advancedSettings.startup_commands.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No data to display
                        </div>
                    ) : (
                        advancedSettings.startup_commands.map((command, index) => (
                            <div key={command.id} className="grid grid-cols-12 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="col-span-2 truncate">{command.full_path}</div>
                                <div className="col-span-2 truncate">{command.parameter}</div>
                                <div className="col-span-2 truncate">{command.working_directory}</div>
                                <div className="col-span-1">{command.run_in_cmd ? 'Yes' : 'No'}</div>
                                <div className="col-span-2">{command.trigger_type}</div>
                                <div className="col-span-2">{command.long_running ? 'Yes' : 'No'}</div>
                                <div className="col-span-1">
                                    <button
                                        onClick={() => removeCommand(command.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={saveAdvancedSettings}
                        className="settings-button rounded-md px-4 py-2"
                        disabled={saving}
                    >
                        Save changes
                    </button>
                </div>
            </div>

            {/* Client Applications */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Client applications</div>
                    <button
                        onClick={() => setShowAddApplication(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add new application</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-6 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div className="col-span-2">NAME</div>
                        <div className="col-span-2">PATH</div>
                        <div className="col-span-1">PARAMETERS</div>
                        <div className="col-span-1">ACTIONS</div>
                    </div>

                    {advancedSettings.client_applications.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No records available.
                        </div>
                    ) : (
                        advancedSettings.client_applications.map((app) => (
                            <div key={app.id} className="grid grid-cols-6 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="col-span-2 truncate">{app.name}</div>
                                <div className="col-span-2 truncate">{app.path}</div>
                                <div className="col-span-1 truncate">{app.parameters}</div>
                                <div className="col-span-1">
                                    <button
                                        onClick={() => removeApplication(app.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Whitelisted Apps */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-lg text-white font-medium">Whitelisted apps</div>
                    <button
                        onClick={() => setShowAddWhitelistedApp(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add whitelisted app</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div>PROCESS NAME</div>
                        <div>ACTIONS</div>
                    </div>

                    {advancedSettings.whitelisted_apps.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No records available.
                        </div>
                    ) : (
                        advancedSettings.whitelisted_apps.map((app) => (
                            <div key={app.id} className="grid grid-cols-2 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                <div className="truncate">{app.process_name}</div>
                                <div>
                                    <button
                                        onClick={() => removeWhitelistedApp(app.id)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Add Command Modal */}
            {showAddCommand && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Add command</h3>
                            <button
                                onClick={() => setShowAddCommand(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Full path *
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.full_path}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, full_path: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter full path"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Parameter
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.parameter}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, parameter: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter parameter"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Working directory
                                </label>
                                <input
                                    type="text"
                                    value={newCommand.working_directory}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, working_directory: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter working directory"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="run_in_cmd"
                                    checked={newCommand.run_in_cmd}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, run_in_cmd: e.target.checked }))}
                                    className="text-purple-500"
                                />
                                <label htmlFor="run_in_cmd" className="text-white text-sm">
                                    Run in cmd
                                </label>
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Trigger type *
                                </label>
                                <select
                                    value={newCommand.trigger_type}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, trigger_type: e.target.value }))}
                                    className="settings-input w-full"
                                >
                                    {triggerTypes.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="long_running"
                                    checked={newCommand.long_running}
                                    onChange={(e) => setNewCommand(prev => ({ ...prev, long_running: e.target.checked }))}
                                    className="text-purple-500"
                                />
                                <label htmlFor="long_running" className="text-white text-sm">
                                    Long running
                                </label>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddCommand(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addCommand}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Application Modal */}
            {showAddApplication && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Create new client application</h3>
                            <button
                                onClick={() => setShowAddApplication(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.name}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, name: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter application name"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Path *
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.path}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, path: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter application path"
                                />
                            </div>

                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Parameters
                                </label>
                                <input
                                    type="text"
                                    value={newApplication.parameters}
                                    onChange={(e) => setNewApplication(prev => ({ ...prev, parameters: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter parameters"
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddApplication(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addApplication}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Whitelisted App Modal */}
            {showAddWhitelistedApp && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg text-white font-medium">Add whitelisted app</h3>
                            <button
                                onClick={() => setShowAddWhitelistedApp(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mb-4">
                            <p className="text-gray-400 text-sm mb-4">
                                Add the process name of the application that should be whitelisted (eg notepad or notepad.exe).
                            </p>
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Process name *
                                </label>
                                <input
                                    type="text"
                                    value={newWhitelistedApp.process_name}
                                    onChange={(e) => setNewWhitelistedApp(prev => ({ ...prev, process_name: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter process name"
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddWhitelistedApp(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addWhitelistedApp}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClientSecurity() {
    const [securitySettings, setSecuritySettings] = useState({
        computers: [],
        security_groups: [],
        selected_computer_filter: 'all'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showAddSecurityGroup, setShowAddSecurityGroup] = useState(false);
    const [selectedComputer, setSelectedComputer] = useState(null);

    // Modal states
    const [newSecurityGroup, setNewSecurityGroup] = useState({
        name: '',
        system_settings: {
            task_manager: false,
            batch_files: false,
            usb_access: false,
            powershell: false,
            power_button_action: false
        },
        browser_settings: {
            incognito_mode: 'Available',
            file_explorer: false,
            file_download: false,
            extensions: false
        },
        disabled_hard_drives: [],
        blocked_applications: [],
        url_blacklist: []
    });

    useEffect(() => {
        loadSecuritySettings();
    }, []);

    const loadSecuritySettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('client_security');
            const settingsObj = settingsToObject(settings);
            setSecuritySettings(prev => ({ ...prev, ...settingsObj }));

            // Load sample computers if none exist
            if (!settingsObj.computers || settingsObj.computers.length === 0) {
                setSecuritySettings(prev => ({
                    ...prev,
                    computers: [
                        { id: 1, name: 'vaishwik', group: null }
                    ]
                }));
            }
        } catch (error) {
            showToast('Failed to load security settings');
        } finally {
            setLoading(false);
        }
    };

    const saveSecuritySettings = async () => {
        setSaving(true);
        try {
            const settingsArray = objectToSettings(securitySettings, 'client_security');
            await settingsAPI.bulkUpdateSettings(settingsArray);
            showToast('Security settings saved successfully');
        } catch (error) {
            showToast('Failed to save security settings');
        } finally {
            setSaving(false);
        }
    };

    const addSecurityGroup = () => {
        if (!newSecurityGroup.name.trim()) {
            showToast('Security group name is required');
            return;
        }

        const group = {
            id: Date.now(),
            ...newSecurityGroup
        };

        setSecuritySettings(prev => ({
            ...prev,
            security_groups: [...prev.security_groups, group]
        }));

        setNewSecurityGroup({
            name: '',
            system_settings: {
                task_manager: false,
                batch_files: false,
                usb_access: false,
                powershell: false,
                power_button_action: false
            },
            browser_settings: {
                incognito_mode: 'Available',
                file_explorer: false,
                file_download: false,
                extensions: false
            },
            disabled_hard_drives: [],
            blocked_applications: [],
            url_blacklist: []
        });
        setShowAddSecurityGroup(false);
        showToast('Security group added successfully');
    };

    const removeSecurityGroup = (id) => {
        setSecuritySettings(prev => ({
            ...prev,
            security_groups: prev.security_groups.filter(group => group.id !== id)
        }));
        showToast('Security group removed');
    };

    const updateSystemSetting = (setting, value) => {
        setNewSecurityGroup(prev => ({
            ...prev,
            system_settings: {
                ...prev.system_settings,
                [setting]: value
            }
        }));
    };

    const updateBrowserSetting = (setting, value) => {
        setNewSecurityGroup(prev => ({
            ...prev,
            browser_settings: {
                ...prev.browser_settings,
                [setting]: value
            }
        }));
    };

    const addDisabledDrive = (drive) => {
        if (drive && !newSecurityGroup.disabled_hard_drives.includes(drive)) {
            setNewSecurityGroup(prev => ({
                ...prev,
                disabled_hard_drives: [...prev.disabled_hard_drives, drive]
            }));
        }
    };

    const removeDisabledDrive = (drive) => {
        setNewSecurityGroup(prev => ({
            ...prev,
            disabled_hard_drives: prev.disabled_hard_drives.filter(d => d !== drive)
        }));
    };

    const addBlockedApplication = (app) => {
        if (app && !newSecurityGroup.blocked_applications.includes(app)) {
            setNewSecurityGroup(prev => ({
                ...prev,
                blocked_applications: [...prev.blocked_applications, app]
            }));
        }
    };

    const removeBlockedApplication = (app) => {
        setNewSecurityGroup(prev => ({
            ...prev,
            blocked_applications: prev.blocked_applications.filter(a => a !== app)
        }));
    };

    const addUrlToBlacklist = (url) => {
        if (url && !newSecurityGroup.url_blacklist.includes(url)) {
            setNewSecurityGroup(prev => ({
                ...prev,
                url_blacklist: [...prev.url_blacklist, url]
            }));
        }
    };

    const removeUrlFromBlacklist = (url) => {
        setNewSecurityGroup(prev => ({
            ...prev,
            url_blacklist: prev.url_blacklist.filter(u => u !== url)
        }));
    };

    const incognitoOptions = ['Available', 'Forced', 'Disabled'];

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Security
                <div className="text-gray-400 text-sm mt-2">Loading security settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Security</div>

            {/* Security Policy Management */}
            <div className="settings-card p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-lg text-white font-medium mb-2">Security</div>
                        <button
                            className={`px-4 py-2 rounded-md text-sm font-medium ${securitySettings.selected_computer_filter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            onClick={() => setSecuritySettings(prev => ({ ...prev, selected_computer_filter: 'all' }))}
                        >
                            All computers
                        </button>
                    </div>
                    <button
                        onClick={() => setShowAddSecurityGroup(true)}
                        className="settings-button-primary rounded-md px-4 py-2 flex items-center space-x-2"
                    >
                        <span>+</span>
                        <span>Add security group</span>
                    </button>
                </div>

                <div className="bg-gray-800 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                        <div>COMPUTERS LIST</div>
                        <div>GROUP</div>
                    </div>

                    {securitySettings.computers.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                            No computers available
                        </div>
                    ) : (
                        securitySettings.computers.map((computer) => (
                            <div
                                key={computer.id}
                                className={`grid grid-cols-2 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm cursor-pointer hover:bg-gray-700 ${selectedComputer?.id === computer.id ? 'bg-gray-700' : ''
                                    }`}
                                onClick={() => setSelectedComputer(computer)}
                            >
                                <div className="truncate">{computer.name}</div>
                                <div className="truncate text-gray-400">{computer.group || 'No group assigned'}</div>
                            </div>
                        ))
                    )}
                </div>

                {/* Security Groups List */}
                {securitySettings.security_groups.length > 0 && (
                    <div className="mt-6">
                        <div className="text-lg text-white font-medium mb-4">Security Groups</div>
                        <div className="bg-gray-800 rounded-lg">
                            <div className="grid grid-cols-3 gap-4 p-3 border-b border-gray-700 text-gray-400 text-sm font-medium">
                                <div>NAME</div>
                                <div>SYSTEM SETTINGS</div>
                                <div>ACTIONS</div>
                            </div>

                            {securitySettings.security_groups.map((group) => (
                                <div key={group.id} className="grid grid-cols-3 gap-4 p-3 border-b border-gray-700 last:border-b-0 text-white text-sm">
                                    <div className="truncate">{group.name}</div>
                                    <div className="truncate text-gray-400">
                                        {Object.values(group.system_settings).filter(Boolean).length} enabled
                                    </div>
                                    <div>
                                        <button
                                            onClick={() => removeSecurityGroup(group.id)}
                                            className="text-red-400 hover:text-red-300"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Security Group Modal */}
            {showAddSecurityGroup && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg text-white font-medium">Security policy group</h3>
                            <button
                                onClick={() => setShowAddSecurityGroup(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-6">
                            {/* Name Field */}
                            <div>
                                <label className="block text-white text-sm mb-2">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={newSecurityGroup.name}
                                    onChange={(e) => setNewSecurityGroup(prev => ({ ...prev, name: e.target.value }))}
                                    className="settings-input w-full"
                                    placeholder="Enter security group name"
                                />
                            </div>

                            {/* System and Browser Settings */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* System Settings */}
                                <div>
                                    <h4 className="text-white font-medium mb-4">System settings</h4>
                                    <div className="space-y-3">
                                        {[
                                            { key: 'task_manager', label: 'Task manager' },
                                            { key: 'batch_files', label: 'Batch files' },
                                            { key: 'usb_access', label: 'Usb access' },
                                            { key: 'powershell', label: 'PowerShell' },
                                            { key: 'power_button_action', label: 'Power button action' }
                                        ].map(({ key, label }) => (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-white text-sm">{label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newSecurityGroup.system_settings[key]}
                                                        onChange={(e) => updateSystemSetting(key, e.target.checked)}
                                                        className="sr-only peer"
                                                    />
                                                    <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${newSecurityGroup.system_settings[key] ? 'bg-red-500' : 'bg-gray-600'
                                                        }`}></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Browser Settings */}
                                <div>
                                    <h4 className="text-white font-medium mb-4">Browser settings</h4>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-white text-sm mb-2">
                                                Incognito mode
                                            </label>
                                            <select
                                                value={newSecurityGroup.browser_settings.incognito_mode}
                                                onChange={(e) => updateBrowserSetting('incognito_mode', e.target.value)}
                                                className="settings-input w-full"
                                            >
                                                {incognitoOptions.map(option => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {[
                                            { key: 'file_explorer', label: 'File explorer' },
                                            { key: 'file_download', label: 'File download' },
                                            { key: 'extensions', label: 'Extensions' }
                                        ].map(({ key, label }) => (
                                            <div key={key} className="flex items-center justify-between">
                                                <span className="text-white text-sm">{label}</span>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newSecurityGroup.browser_settings[key]}
                                                        onChange={(e) => updateBrowserSetting(key, e.target.checked)}
                                                        className="sr-only peer"
                                                    />
                                                    <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${newSecurityGroup.browser_settings[key] ? 'bg-red-500' : 'bg-gray-600'
                                                        }`}></div>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Additional Settings */}
                            <div className="space-y-4">
                                {/* Disabled Hard Drives */}
                                <div>
                                    <label className="block text-white text-sm mb-2">
                                        Disabled hard drives
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {newSecurityGroup.disabled_hard_drives.length === 0 ? (
                                            <span className="text-gray-400 text-sm">None</span>
                                        ) : (
                                            newSecurityGroup.disabled_hard_drives.map((drive, index) => (
                                                <span key={index} className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1">
                                                    <span>{drive}</span>
                                                    <button
                                                        onClick={() => removeDisabledDrive(drive)}
                                                        className="text-red-400 hover:text-red-300"
                                                    >
                                                        ✕
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Enter drive letter (e.g., D:)"
                                            className="settings-input flex-1"
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addDisabledDrive(e.target.value);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={(e) => {
                                                const input = e.target.previousSibling;
                                                addDisabledDrive(input.value);
                                                input.value = '';
                                            }}
                                            className="settings-button px-3 py-2"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* Blocked Applications */}
                                <div>
                                    <label className="block text-white text-sm mb-2">
                                        Blocked applications
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {newSecurityGroup.blocked_applications.map((app, index) => (
                                            <span key={index} className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1">
                                                <span>{app}</span>
                                                <button
                                                    onClick={() => removeBlockedApplication(app)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Enter application name"
                                            className="settings-input flex-1"
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addBlockedApplication(e.target.value);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={(e) => {
                                                const input = e.target.previousSibling;
                                                addBlockedApplication(input.value);
                                                input.value = '';
                                            }}
                                            className="settings-button px-3 py-2"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* URL Blacklist */}
                                <div>
                                    <label className="block text-white text-sm mb-2">
                                        URL blacklist
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {newSecurityGroup.url_blacklist.map((url, index) => (
                                            <span key={index} className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex items-center space-x-1">
                                                <span>{url}</span>
                                                <button
                                                    onClick={() => removeUrlFromBlacklist(url)}
                                                    className="text-red-400 hover:text-red-300"
                                                >
                                                    ✕
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex space-x-2">
                                        <input
                                            type="text"
                                            placeholder="Enter URL to block"
                                            className="settings-input flex-1"
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addUrlToBlacklist(e.target.value);
                                                    e.target.value = '';
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={(e) => {
                                                const input = e.target.previousSibling;
                                                addUrlToBlacklist(input.value);
                                                input.value = '';
                                            }}
                                            className="settings-button px-3 py-2"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => setShowAddSecurityGroup(false)}
                                className="settings-button rounded-md px-4 py-2 flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={addSecurityGroup}
                                className="settings-button-primary rounded-md px-4 py-2 flex-1"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ClientGamesApps() {
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [pageSize] = useState(100);
    const [editModal, setEditModal] = useState(false);
    const [editingGame, setEditingGame] = useState(null);
    const [editForm, setEditForm] = useState({
        name: '',
        category: 'game',
        age_rating: 0,
        tags: [],
        website: '',
        pc_groups: [],
        user_groups: '',
        launchers: [],
        never_use_parent_license: false,
        image_600x900: '',
        image_background: '',
        logo_url: ''
    });

    useEffect(() => {
        loadGames();
    }, [searchTerm, filter, currentPage]);

    const loadGames = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                skip: currentPage * pageSize,
                limit: pageSize,
                search: searchTerm || undefined,
                category: filter === 'all' ? undefined : filter,
                enabled: filter === 'enabled' ? true : filter === 'disabled' ? false : undefined
            });

            const [gamesResponse, countResponse] = await Promise.all([
                fetch(`/api/games?${params}`),
                fetch(`/api/games/count?${params}`)
            ]);

            if (gamesResponse.ok && countResponse.ok) {
                const gamesData = await gamesResponse.json();
                const countData = await countResponse.json();
                setGames(gamesData);
                setTotalCount(countData.count);
            }
        } catch (error) {
            console.error('Failed to load games:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleGame = async (gameId, enabled) => {
        try {
            const response = await fetch(`/api/games/${gameId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ enabled: !enabled })
            });

            if (response.ok) {
                setGames(prev => prev.map(game =>
                    game.id === gameId ? { ...game, enabled: !enabled } : game
                ));
            }
        } catch (error) {
            console.error('Failed to toggle game:', error);
        }
    };

    const openEditModal = (game) => {
        setEditingGame(game);
        setEditForm({
            name: game.name || '',
            category: game.category || 'game',
            age_rating: game.age_rating || 0,
            tags: game.tags ? JSON.parse(game.tags) : [],
            website: game.website || '',
            pc_groups: game.pc_groups ? JSON.parse(game.pc_groups) : [],
            user_groups: game.user_groups || '',
            launchers: game.launchers ? JSON.parse(game.launchers) : [],
            never_use_parent_license: game.never_use_parent_license || false,
            image_600x900: game.image_600x900 || '',
            image_background: game.image_background || '',
            logo_url: game.logo_url || ''
        });
        setEditModal(true);
    };

    const closeEditModal = () => {
        setEditModal(false);
        setEditingGame(null);
        setEditForm({
            name: '',
            category: 'game',
            age_rating: 0,
            tags: [],
            website: '',
            pc_groups: [],
            user_groups: '',
            launchers: [],
            never_use_parent_license: false,
            image_600x900: '',
            image_background: '',
            logo_url: ''
        });
    };

    const saveGame = async () => {
        try {
            const response = await fetch(`/api/games/${editingGame.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...editForm,
                    tags: JSON.stringify(editForm.tags),
                    pc_groups: JSON.stringify(editForm.pc_groups),
                    launchers: JSON.stringify(editForm.launchers)
                })
            });

            if (response.ok) {
                const updatedGame = await response.json();
                setGames(prev => prev.map(game =>
                    game.id === editingGame.id ? updatedGame : game
                ));
                closeEditModal();
            }
        } catch (error) {
            console.error('Failed to save game:', error);
        }
    };

    const addTag = (tag) => {
        if (tag && !editForm.tags.includes(tag)) {
            setEditForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
        }
    };

    const removeTag = (tagToRemove) => {
        setEditForm(prev => ({ ...prev, tags: prev.tags.filter(tag => tag !== tagToRemove) }));
    };

    const addLauncher = () => {
        setEditForm(prev => ({
            ...prev,
            launchers: [...prev.launchers, { name: '', path: '', parameters: '' }]
        }));
    };

    const updateLauncher = (index, field, value) => {
        setEditForm(prev => ({
            ...prev,
            launchers: prev.launchers.map((launcher, i) =>
                i === index ? { ...launcher, [field]: value } : launcher
            )
        }));
    };

    const removeLauncher = (index) => {
        setEditForm(prev => ({
            ...prev,
            launchers: prev.launchers.filter((_, i) => i !== index)
        }));
    };

    const getFilterCount = (filterType) => {
        if (filterType === 'all') return totalCount;
        if (filterType === 'enabled') return games.filter(g => g.enabled).length;
        if (filterType === 'disabled') return games.filter(g => !g.enabled).length;
        return 0;
    };

    if (loading && games.length === 0) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Client/Games & apps
                <div className="text-gray-400 text-sm mt-2">Loading games...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Client/Games & apps</div>

            {/* Search and Filters */}
            <div className="settings-card p-4 mb-4">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search games & apps"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="settings-input w-full lg:w-80"
                        />
                    </div>

                    <div className="flex space-x-2">
                        {[
                            { key: 'all', label: 'All' },
                            { key: 'enabled', label: 'Enabled' },
                            { key: 'disabled', label: 'Disabled' },
                            { key: 'top100', label: 'Top 100' },
                            { key: 'newly', label: 'Newly added' }
                        ].map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filter === key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="text-gray-400 text-sm">
                        Results: {totalCount} games
                    </div>
                </div>
            </div>

            {/* Games Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {games.map((game) => (
                    <div
                        key={game.id}
                        className="bg-gray-800 rounded-lg p-3 relative group cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={() => openEditModal(game)}
                    >
                        {/* Game Logo */}
                        <div className="relative mb-3">
                            <div className="w-full h-24 bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                                {game.logo_url ? (
                                    <img
                                        src={game.logo_url}
                                        alt={game.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                        }}
                                    />
                                ) : null}
                                <div className="w-full h-full bg-gray-600 flex items-center justify-center text-gray-400 text-xs text-center">
                                    {game.name.substring(0, 2).toUpperCase()}
                                </div>
                            </div>

                            {/* Toggle Switch */}
                            <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={game.enabled}
                                        onChange={() => toggleGame(game.id, game.enabled)}
                                        className="sr-only peer"
                                    />
                                    <div className={`w-8 h-4 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all ${game.enabled ? 'bg-green-500' : 'bg-gray-600'
                                        }`}></div>
                                </label>
                            </div>
                        </div>

                        {/* Game Name */}
                        <div className="text-white text-xs font-medium text-center line-clamp-2">
                            {game.name}
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit Game Modal */}
            {editModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-semibold text-white">Edit '{editingGame?.name}'</h2>
                            <button
                                onClick={closeEditModal}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                                {/* Application Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Application Type</label>
                                    <select
                                        value={editForm.category}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                        className="settings-input w-full"
                                    >
                                        <option value="game">Game</option>
                                        <option value="app">Application</option>
                                    </select>
                                </div>

                                {/* Age Rating */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Age Rating</label>
                                    <input
                                        type="number"
                                        value={editForm.age_rating}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, age_rating: parseInt(e.target.value) || 0 }))}
                                        className="settings-input w-full"
                                        min="0"
                                        max="18"
                                    />
                                </div>

                                {/* Tags */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Tags</label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {editForm.tags.map((tag, index) => (
                                            <span key={index} className="bg-blue-600 text-white px-2 py-1 rounded text-sm flex items-center">
                                                {tag}
                                                <button
                                                    onClick={() => removeTag(tag)}
                                                    className="ml-2 text-white hover:text-red-300"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Add tag"
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    addTag(e.target.value);
                                                    e.target.value = '';
                                                }
                                            }}
                                            className="settings-input flex-1"
                                        />
                                        <button
                                            onClick={() => {
                                                const input = document.querySelector('input[placeholder="Add tag"]');
                                                if (input && input.value) {
                                                    addTag(input.value);
                                                    input.value = '';
                                                }
                                            }}
                                            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>

                                {/* Website */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Link to official website</label>
                                    <input
                                        type="url"
                                        value={editForm.website}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, website: e.target.value }))}
                                        className="settings-input w-full"
                                        placeholder="https://example.com"
                                    />
                                </div>

                                {/* PC Groups */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Eligible PC groups</label>
                                    <select
                                        value={editForm.pc_groups[0] || ''}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, pc_groups: [e.target.value] }))}
                                        className="settings-input w-full"
                                    >
                                        <option value="">Select PC group</option>
                                        <option value="General Systems">General Systems</option>
                                        <option value="Gaming PCs">Gaming PCs</option>
                                        <option value="Workstations">Workstations</option>
                                    </select>
                                </div>

                                {/* User Groups */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Eligible user groups</label>
                                    <input
                                        type="text"
                                        value={editForm.user_groups}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, user_groups: e.target.value }))}
                                        className="settings-input w-full"
                                        placeholder="Enter user groups"
                                    />
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                {/* Launchers */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Launchers</label>
                                    <div className="space-y-2">
                                        {editForm.launchers.map((launcher, index) => (
                                            <div key={index} className="bg-gray-700 p-3 rounded">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-white text-sm">Epic Games</span>
                                                    <button
                                                        onClick={() => removeLauncher(index)}
                                                        className="text-red-400 hover:text-red-300"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={launcher.path || ''}
                                                    onChange={(e) => updateLauncher(index, 'path', e.target.value)}
                                                    className="settings-input w-full mb-2"
                                                    placeholder="Launcher path"
                                                />
                                                <input
                                                    type="text"
                                                    value={launcher.parameters || ''}
                                                    onChange={(e) => updateLauncher(index, 'parameters', e.target.value)}
                                                    className="settings-input w-full"
                                                    placeholder="Launch parameters"
                                                />
                                            </div>
                                        ))}
                                        <button
                                            onClick={addLauncher}
                                            className="w-full px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                                        >
                                            Add new launcher
                                        </button>
                                    </div>
                                </div>

                                {/* Never use parent license */}
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="never-use-parent"
                                        checked={editForm.never_use_parent_license}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, never_use_parent_license: e.target.checked }))}
                                        className="mr-2"
                                    />
                                    <label htmlFor="never-use-parent" className="text-sm text-gray-300">
                                        Never use parent license for this game
                                    </label>
                                    <span className="ml-2 text-gray-400 cursor-help">ⓘ</span>
                                </div>

                                {/* Image Previews */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Image 600x900</label>
                                        <input
                                            type="url"
                                            value={editForm.image_600x900}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, image_600x900: e.target.value }))}
                                            className="settings-input w-full"
                                            placeholder="Poster image URL"
                                        />
                                        {editForm.image_600x900 && (
                                            <img
                                                src={editForm.image_600x900}
                                                alt="Poster"
                                                className="w-20 h-30 object-cover rounded mt-2"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Image (background)</label>
                                        <input
                                            type="url"
                                            value={editForm.image_background}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, image_background: e.target.value }))}
                                            className="settings-input w-full"
                                            placeholder="Background image URL"
                                        />
                                        {editForm.image_background && (
                                            <img
                                                src={editForm.image_background}
                                                alt="Background"
                                                className="w-20 h-12 object-cover rounded mt-2"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">Logo icon</label>
                                        <input
                                            type="url"
                                            value={editForm.logo_url}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, logo_url: e.target.value }))}
                                            className="settings-input w-full"
                                            placeholder="Logo image URL"
                                        />
                                        {editForm.logo_url && (
                                            <img
                                                src={editForm.logo_url}
                                                alt="Logo"
                                                className="w-12 h-12 object-cover rounded mt-2"
                                                onError={(e) => e.target.style.display = 'none'}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-4 mt-6 pt-6 border-t border-gray-700">
                            <button
                                onClick={closeEditModal}
                                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveGame}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pagination */}
            {totalCount > pageSize && (
                <div className="flex justify-center mt-6">
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                            disabled={currentPage === 0}
                            className="px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <span className="px-4 py-2 text-white">
                            Page {currentPage + 1} of {Math.ceil(totalCount / pageSize)}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            disabled={currentPage >= Math.ceil(totalCount / pageSize) - 1}
                            className="px-4 py-2 bg-gray-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingsRoot() {
    const menu = [
        {
            key: 'center', label: 'Center config', items: [
                { key: 'financial', label: 'Financial configuration' },
                { key: 'reports', label: 'Report configuration' },
                { key: 'info', label: 'Center information' },
                { key: 'network', label: 'Center network' },
                { key: 'user-fields', label: 'User details configuration' },
                { key: 'licenses', label: 'Licenses' },
                { key: 'language', label: 'Language' },
            ]
        },
        {
            key: 'client', label: 'Client configuration', items: [
                { key: 'billing', label: 'Billing information' },
                { key: 'general', label: 'General settings' },
                { key: 'version', label: 'Version' },
                { key: 'consoles', label: 'Consoles' },
                { key: 'homescreen', label: 'Home screen' },
                { key: 'customization', label: 'Customization' },
                { key: 'advanced', label: 'Advanced' },
                { key: 'security', label: 'Security' },
                { key: 'games-apps', label: 'Games/apps' },
                { key: 'terms', label: 'Terms and conditions' },
                { key: 'discord', label: 'Discord configuration' },
            ]
        },
        { key: 'shop', label: 'Shop settings', items: [] },
        { key: 'groups', label: 'Groups config', items: [] },
        { key: 'employees', label: 'Employees', items: [] },
        { key: 'loyalty', label: 'Loyalty system', items: [] },
        { key: 'players', label: 'Players web portal', items: [] },
        { key: 'exports', label: 'Exports' },
        { key: 'bookings', label: 'Bookings' },
        { key: 'webadmin', label: 'Web-admin settings' },
        { key: 'notifications', label: 'Player notifications' },
        { key: 'subscription', label: 'Subscription management' },
        { key: 'userlogin', label: 'User login' },
        { key: 'integrations', label: 'Integrations' },
        { key: 'api', label: 'API', items: [] },
        { key: 'account', label: 'Account' },
        { key: 'marketplace', label: 'Add-Ons Marketplace' },
    ];
    const [active, setActive] = useState('center:financial');
    const [hover, setHover] = useState(null); // current hovered section key
    const [pinned, setPinned] = useState(null); // keep submenu open until changed

    const renderRight = () => {
        const [group, page] = active.split(':');
        // Center config pages
        if (group === 'center' && page === 'financial') return <CenterFinancial />;
        if (group === 'center' && page === 'reports') return <CenterReports />;
        if (group === 'center' && page === 'info') return <CenterInfo />;
        if (group === 'center' && page === 'network') return <CenterNetwork />;
        if (group === 'center' && page === 'user-fields') return <UserDetails />;
        if (group === 'center' && page === 'licenses') return <Licenses />;
        if (group === 'center' && page === 'language') return <CenterLanguage />;

        // Client configuration pages
        if (group === 'client' && page === 'billing') return <PlaceholderPage title="Client/Billing information" />;
        if (group === 'client' && page === 'general') return <ClientGeneral />;
        if (group === 'client' && page === 'version') return <ClientVersion />;
        if (group === 'client' && page === 'consoles') return <ClientConsoles />;
        if (group === 'client' && page === 'homescreen') return <PlaceholderPage title="Client/Home screen" />;
        if (group === 'client' && page === 'customization') return <ClientCustomization />;
        if (group === 'client' && page === 'advanced') return <ClientAdvanced />;
        if (group === 'client' && page === 'security') return <ClientSecurity />;
        if (group === 'client' && page === 'games-apps') return <ClientGamesApps />;
        if (group === 'client' && page === 'terms') return <PlaceholderPage title="Client/Terms and conditions" />;
        if (group === 'client' && page === 'discord') return <PlaceholderPage title="Client/Discord configuration" />;

        // Other main sections
        if (active === 'shop') return <PlaceholderPage title="Shop settings" />;
        if (active === 'groups') return <PlaceholderPage title="Groups config" />;
        if (active === 'employees') return <PlaceholderPage title="Employees" />;
        if (active === 'loyalty') return <PlaceholderPage title="Loyalty system" />;
        if (active === 'players') return <PlaceholderPage title="Players web portal" />;
        if (active === 'exports') return <PlaceholderPage title="Exports" />;
        if (active === 'bookings') return <PlaceholderPage title="Bookings" />;
        if (active === 'webadmin') return <PlaceholderPage title="Web-admin settings" />;
        if (active === 'notifications') return <PlaceholderPage title="Player notifications" />;
        if (active === 'subscription') return <PlaceholderPage title="Subscription management" />;
        if (active === 'userlogin') return <PlaceholderPage title="User login" />;
        if (active === 'integrations') return <PlaceholderPage title="Integrations" />;
        if (active === 'api') return <PlaceholderPage title="API" />;
        if (active === 'account') return <PlaceholderPage title="Account" />;
        if (active === 'marketplace') return <PlaceholderPage title="Add-Ons Marketplace" />;

        return <div className="text-gray-400">Select a settings page</div>;
    };

    return (
        <div className="flex">
            {/* Left menu */}
            <div className="w-64 border-r border-white/10 pr-2">
                <div className="text-2xl font-semibold text-white mb-4">Settings</div>
                {menu.map(section => (
                    <div
                        key={section.key}
                        className="relative"
                        onMouseEnter={() => setHover(section.key)}
                        onMouseLeave={() => { if (pinned !== section.key) setHover(null); }}
                    >
                        <button
                            onClick={() => {
                                if (section.items && section.items.length > 0) {
                                    // Has submenu - toggle pinned state
                                    if (pinned === section.key) {
                                        setPinned(null);
                                        setHover(null);
                                    } else {
                                        setPinned(section.key);
                                        setHover(section.key);
                                    }
                                } else {
                                    // No submenu - directly activate this page
                                    setActive(section.key);
                                    setPinned(null);
                                    setHover(null);
                                }
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md ${active === section.key || active.startsWith(section.key + ':') ? 'nav-neo-active' : 'nav-neo'}`}
                        >
                            <span>{section.label}</span>
                            {section.items && <span>▸</span>}
                        </button>
                        {section.items && ((hover === section.key) || (pinned === section.key)) && (
                            <div
                                className="absolute left-full top-0 ml-2 w-72 calendar-pop z-50"
                                onMouseEnter={() => setHover(section.key)}
                                onMouseLeave={() => { if (pinned !== section.key) setHover(null); }}
                            >
                                {section.items.map(item => (
                                    <button
                                        key={item.key}
                                        className={`w-full text-left px-3 py-2 rounded-md ${active === `${section.key}:${item.key}` ? 'pill-active' : 'pill'}`}
                                        onClick={() => {
                                            setActive(`${section.key}:${item.key}`);
                                            setPinned(section.key);
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {/* Right content */}
            <div className="flex-1 pl-6">
                {renderRight()}
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return <div className="mb-3"><div className="text-gray-300 text-sm mb-1">{label}</div>{children}</div>;
}

function Toggle({ label, value, onChange }) {
    const handleToggle = () => {
        if (onChange) {
            onChange(!value);
        }
    };

    return <div className="flex items-center justify-between bg-white/5 p-3 rounded-md mb-2">
        <div className="text-gray-300">{label}</div>
        <button className={`w-10 h-6 rounded-full ${value ? 'bg-primary' : 'bg-gray-600'}`} onClick={handleToggle}><span className={`block w-5 h-5 bg-white rounded-full transform transition ${value ? 'translate-x-5' : 'translate-x-0'}`}></span></button>
    </div>;
}

function CenterFinancial() {
    const [financialSettings, setFinancialSettings] = useState({
        // Billing information
        company_name: '',
        tax_number: '',
        decimal_places: 2,
        address: '',

        // Payment methods - web admin
        payment_cash: false,
        payment_credit_card: false,
        payment_account_balance: false,

        // Payment methods - client
        client_account_balance: false,
        client_summon_human: false,
        client_stripe_phone: false,
        client_pay_after_logout: false,

        // Tax rates
        tax_included_in_price: false,
        tax1_name: 'Tax 1',
        tax1_percentage: 0.00,
        tax2_name: 'Tax 2',
        tax2_percentage: 0.00,
        tax3_name: 'Tax 3',
        tax3_percentage: 0.00,

        // Guest pricing
        guest_legacy_prices: 'Price per hour (INR)'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadFinancialSettings();
    }, []);

    const loadFinancialSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('financial');
            const settingsObj = settingsToObject(settings);

            setFinancialSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            console.error('Failed to load financial settings:', error);
            showToast('Failed to load financial settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveFinancialSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(financialSettings, 'financial');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Financial settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save financial settings:', error);
            showToast('Failed to save financial settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setFinancialSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Financial
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Financial</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card-animated p-4">
                    <div className="text-gray-400 text-sm mb-2">Billing information</div>
                    <Field label="Company name">
                        <input
                            className="search-input w-full rounded-md px-3 py-2"
                            value={financialSettings.company_name}
                            onChange={(e) => updateSetting('company_name', e.target.value)}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Tax number">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                value={financialSettings.tax_number}
                                onChange={(e) => updateSetting('tax_number', e.target.value)}
                            />
                        </Field>
                        <Field label="Decimal places">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="number"
                                value={financialSettings.decimal_places}
                                onChange={(e) => updateSetting('decimal_places', parseInt(e.target.value) || 2)}
                            />
                        </Field>
                    </div>
                    <Field label="Address">
                        <input
                            className="search-input w-full rounded-md px-3 py-2"
                            value={financialSettings.address}
                            onChange={(e) => updateSetting('address', e.target.value)}
                        />
                    </Field>
                </div>
                <div className="card-animated p-4">
                    <div className="text-gray-400 text-sm mb-2">Accepted web-admin payment methods</div>
                    <div className="flex gap-3">
                        {[
                            { key: 'payment_cash', label: 'Cash' },
                            { key: 'payment_credit_card', label: 'Credit card' },
                            { key: 'payment_account_balance', label: 'Account balance' }
                        ].map(({ key, label }) => (
                            <label key={key} className="pill">
                                <input
                                    type="checkbox"
                                    className="mr-2"
                                    checked={financialSettings[key]}
                                    onChange={(e) => updateSetting(key, e.target.checked)}
                                />
                                {label}
                            </label>
                        ))}
                    </div>
                    <div className="text-gray-400 text-sm mb-2 mt-4">Accepted client payment methods</div>
                    <Toggle
                        label="Account balance"
                        value={financialSettings.client_account_balance}
                        onChange={(value) => updateSetting('client_account_balance', value)}
                    />
                    <Toggle
                        label="Summon a human"
                        value={financialSettings.client_summon_human}
                        onChange={(value) => updateSetting('client_summon_human', value)}
                    />
                    <Toggle
                        label="Stripe (phone)"
                        value={financialSettings.client_stripe_phone}
                        onChange={(value) => updateSetting('client_stripe_phone', value)}
                    />
                    <Toggle
                        label="Pay after logout"
                        value={financialSettings.client_pay_after_logout}
                        onChange={(value) => updateSetting('client_pay_after_logout', value)}
                    />
                </div>
            </div>
            <div className="card-animated p-4 mt-4">
                <div className="text-gray-400 text-sm mb-2">Tax rates</div>
                <label className="pill inline-flex items-center mb-3">
                    <input
                        type="checkbox"
                        className="mr-2"
                        checked={financialSettings.tax_included_in_price}
                        onChange={(e) => updateSetting('tax_included_in_price', e.target.checked)}
                    />
                    Tax calculation included in price
                </label>
                {[1, 2, 3].map(i => (
                    <div key={i} className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                        <Field label={`Tax ${i} Name`}>
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                value={financialSettings[`tax${i}_name`]}
                                onChange={(e) => updateSetting(`tax${i}_name`, e.target.value)}
                            />
                        </Field>
                        <Field label="Percentage">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="number"
                                step="0.01"
                                value={financialSettings[`tax${i}_percentage`]}
                                onChange={(e) => updateSetting(`tax${i}_percentage`, parseFloat(e.target.value) || 0.00)}
                            />
                        </Field>
                    </div>
                ))}
                <div className="mt-6">
                    <Field label="Guest legacy prices">
                        <select
                            className="search-input rounded-md px-3 py-2"
                            value={financialSettings.guest_legacy_prices}
                            onChange={(e) => updateSetting('guest_legacy_prices', e.target.value)}
                        >
                            <option>Price per hour (INR)</option>
                            <option>Price per minute (INR)</option>
                            <option>Fixed price per session</option>
                        </select>
                    </Field>
                </div>
                <button
                    className="pill mt-2"
                    onClick={saveFinancialSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function CenterReports() {
    const [reportsSettings, setReportsSettings] = useState({
        start_of_day: '8:00 am',
        start_of_week: 'Sunday',
        ignore_data_before: '',
        shift_mode: 'None',
        reporting_emails: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newEmail, setNewEmail] = useState('');

    useEffect(() => {
        loadReportsSettings();
    }, []);

    const loadReportsSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('reports');
            const settingsObj = settingsToObject(settings);

            // Handle email list separately as it's stored as JSON
            const emails = settingsObj.reporting_emails || [];
            delete settingsObj.reporting_emails;

            setReportsSettings(prev => ({
                ...prev,
                ...settingsObj,
                reporting_emails: Array.isArray(emails) ? emails : []
            }));
        } catch (error) {
            console.error('Failed to load reports settings:', error);
            showToast('Failed to load reports settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveReportsSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(reportsSettings, 'reports');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Reports settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save reports settings:', error);
            showToast('Failed to save reports settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setReportsSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const addEmail = () => {
        if (newEmail && !reportsSettings.reporting_emails.includes(newEmail)) {
            const updatedEmails = [...reportsSettings.reporting_emails, newEmail];
            updateSetting('reporting_emails', updatedEmails);
            setNewEmail('');
        }
    };

    const removeEmail = (emailToRemove) => {
        const updatedEmails = reportsSettings.reporting_emails.filter(email => email !== emailToRemove);
        updateSetting('reporting_emails', updatedEmails);
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Reports
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Reports</div>
            <div className="card-animated p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <Field label="Start of day">
                        <input
                            className="search-input w-full rounded-md px-3 py-2"
                            type="time"
                            value={reportsSettings.start_of_day}
                            onChange={(e) => updateSetting('start_of_day', e.target.value)}
                        />
                    </Field>
                    <Field label="Start of the week">
                        <select
                            className="search-input rounded-md px-3 py-2"
                            value={reportsSettings.start_of_week}
                            onChange={(e) => updateSetting('start_of_week', e.target.value)}
                        >
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <option key={day} value={day}>{day}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Ignore all data before">
                        <input
                            className="search-input w-full rounded-md px-3 py-2"
                            type="date"
                            value={reportsSettings.ignore_data_before}
                            onChange={(e) => updateSetting('ignore_data_before', e.target.value)}
                        />
                    </Field>
                </div>
                <div className="mt-4">
                    <div className="text-gray-300 text-sm mb-2">Shift mode</div>
                    <div className="flex gap-6 text-gray-300">
                        {['None', 'Normal', 'Strict'].map(mode => (
                            <label key={mode} className="pill">
                                <input
                                    type="radio"
                                    name="shift"
                                    className="mr-2"
                                    checked={reportsSettings.shift_mode === mode}
                                    onChange={() => updateSetting('shift_mode', mode)}
                                />
                                {mode}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="mt-6">
                    <Field label="Reporting mailing list">
                        <div className="flex gap-2">
                            <input
                                className="search-input flex-1 rounded-md px-3 py-2"
                                placeholder="Enter email address"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                            />
                            <button className="pill" onClick={addEmail}>Add email</button>
                        </div>
                    </Field>
                    {reportsSettings.reporting_emails.length > 0 && (
                        <div className="mt-3">
                            <div className="text-gray-400 text-sm mb-2">Current emails:</div>
                            <div className="flex flex-wrap gap-2">
                                {reportsSettings.reporting_emails.map(email => (
                                    <div key={email} className="pill inline-flex items-center gap-2">
                                        {email}
                                        <button
                                            className="text-red-400 hover:text-red-300"
                                            onClick={() => removeEmail(email)}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <button
                    className="pill mt-4"
                    onClick={saveReportsSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function CenterInfo() {
    const [centerInfoSettings, setCenterInfoSettings] = useState({
        // Center information
        logo_url: '',
        address: '',
        email: '',
        phone: '',
        discord_link: '',

        // Social media
        facebook_username: '',
        instagram_username: '',
        twitter_url: '',
        youtube_channel_url: '',
        twitch_url: '',

        // Working hours (placeholder for future implementation)
        working_hours: [],
        special_schedule: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadCenterInfoSettings();
    }, []);

    const loadCenterInfoSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('center_info');
            const settingsObj = settingsToObject(settings);

            setCenterInfoSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            console.error('Failed to load center info settings:', error);
            showToast('Failed to load center info settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveCenterInfoSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(centerInfoSettings, 'center_info');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Center info settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save center info settings:', error);
            showToast('Failed to save center info settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setCenterInfoSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleLogoUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            // In a real implementation, you'd upload the file to a server
            // For now, we'll just create a data URL
            const reader = new FileReader();
            reader.onload = (e) => {
                updateSetting('logo_url', e.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Center configuration
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Center configuration</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card-animated p-4">
                    <div className="text-gray-400 text-sm mb-2">Center information</div>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="border border-white/10 rounded-md p-8 text-gray-400 text-center relative">
                            {centerInfoSettings.logo_url ? (
                                <img
                                    src={centerInfoSettings.logo_url}
                                    alt="Center Logo"
                                    className="max-w-full max-h-32 object-contain mx-auto mb-2"
                                />
                            ) : (
                                <div className="mb-2">No logo uploaded</div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="text-xs">Click to upload Logo (390×270px)</div>
                        </div>
                        <Field label="Address">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                value={centerInfoSettings.address}
                                onChange={(e) => updateSetting('address', e.target.value)}
                            />
                        </Field>
                        <Field label="Email">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="email"
                                value={centerInfoSettings.email}
                                onChange={(e) => updateSetting('email', e.target.value)}
                            />
                        </Field>
                        <Field label="Phone">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="tel"
                                value={centerInfoSettings.phone}
                                onChange={(e) => updateSetting('phone', e.target.value)}
                            />
                        </Field>
                        <Field label="Discord link">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="url"
                                value={centerInfoSettings.discord_link}
                                onChange={(e) => updateSetting('discord_link', e.target.value)}
                            />
                        </Field>
                    </div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-gray-400 text-sm mb-2">Social media</div>
                    <div className="grid grid-cols-1 gap-3">
                        <Field label="Facebook username">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                value={centerInfoSettings.facebook_username}
                                onChange={(e) => updateSetting('facebook_username', e.target.value)}
                            />
                        </Field>
                        <Field label="Instagram username">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                value={centerInfoSettings.instagram_username}
                                onChange={(e) => updateSetting('instagram_username', e.target.value)}
                            />
                        </Field>
                        <Field label="Twitter url">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="url"
                                value={centerInfoSettings.twitter_url}
                                onChange={(e) => updateSetting('twitter_url', e.target.value)}
                            />
                        </Field>
                        <Field label="Youtube channel url">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="url"
                                value={centerInfoSettings.youtube_channel_url}
                                onChange={(e) => updateSetting('youtube_channel_url', e.target.value)}
                            />
                        </Field>
                        <Field label="Twitch url">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="url"
                                value={centerInfoSettings.twitch_url}
                                onChange={(e) => updateSetting('twitch_url', e.target.value)}
                            />
                        </Field>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                <div className="card-animated h-64 flex items-center justify-center">
                    <div className="text-gray-400 text-center">
                        <div className="text-sm mb-2">Working hours configuration</div>
                        <div className="text-xs">Coming soon...</div>
                    </div>
                </div>
                <div className="card-animated p-4 text-gray-300">
                    <div className="text-sm font-medium mb-2">Working hours</div>
                    <div className="text-xs text-gray-400">Monday - Friday: 9:00 AM - 11:00 PM</div>
                    <div className="text-xs text-gray-400">Saturday - Sunday: 8:00 AM - 12:00 AM</div>
                </div>
                <div className="card-animated p-4 text-gray-300">
                    <div className="text-sm font-medium mb-2">Special schedule</div>
                    <div className="text-xs text-gray-400">No special schedules configured</div>
                </div>
            </div>
            <div className="mt-6">
                <button
                    className="pill"
                    onClick={saveCenterInfoSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function CenterNetwork() {
    const [networkSettings, setNetworkSettings] = useState({
        owner_email: '',
        network_status: 'not_joined', // not_joined, pending, joined
        network_id: '',
        shared_resources: false,
        data_sync: false,
        remote_support: false
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [joiningNetwork, setJoiningNetwork] = useState(false);

    useEffect(() => {
        loadNetworkSettings();
    }, []);

    const loadNetworkSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('center_network');
            const settingsObj = settingsToObject(settings);

            setNetworkSettings(prev => ({
                ...prev,
                ...settingsObj
            }));
        } catch (error) {
            console.error('Failed to load network settings:', error);
            showToast('Failed to load network settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveNetworkSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(networkSettings, 'center_network');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Network settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save network settings:', error);
            showToast('Failed to save network settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setNetworkSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const joinNetwork = async () => {
        if (!networkSettings.owner_email) {
            showToast('Please enter owner email first', 'error');
            return;
        }

        setJoiningNetwork(true);
        try {
            // In a real implementation, this would make an API call to join the network
            updateSetting('network_status', 'pending');
            await saveNetworkSettings();
            showToast('Network join request sent. Awaiting approval.', 'success');
        } catch (error) {
            console.error('Failed to join network:', error);
            showToast('Failed to join network', 'error');
        } finally {
            setJoiningNetwork(false);
        }
    };

    const leaveNetwork = async () => {
        try {
            updateSetting('network_status', 'not_joined');
            updateSetting('network_id', '');
            await saveNetworkSettings();
            showToast('Successfully left the network', 'success');
        } catch (error) {
            console.error('Failed to leave network:', error);
            showToast('Failed to leave network', 'error');
        }
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Center network
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    const getStatusColor = (status) => {
        switch (status) {
            case 'joined': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'joined': return 'Connected to network';
            case 'pending': return 'Join request pending approval';
            default: return 'Not connected to network';
        }
    };

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Center network</div>

            {/* Network Status */}
            <div className="card-animated p-4 mb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-gray-300 text-sm mb-1">Network Status</div>
                        <div className={`text-sm ${getStatusColor(networkSettings.network_status)}`}>
                            {getStatusText(networkSettings.network_status)}
                        </div>
                        {networkSettings.network_id && (
                            <div className="text-xs text-gray-500 mt-1">
                                Network ID: {networkSettings.network_id}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {networkSettings.network_status === 'not_joined' && (
                            <button
                                className="pill"
                                onClick={joinNetwork}
                                disabled={joiningNetwork || !networkSettings.owner_email}
                            >
                                {joiningNetwork ? 'Joining...' : 'Join Network'}
                            </button>
                        )}
                        {networkSettings.network_status === 'joined' && (
                            <button
                                className="pill bg-red-600 hover:bg-red-700"
                                onClick={leaveNetwork}
                            >
                                Leave Network
                            </button>
                        )}
                        {networkSettings.network_status === 'pending' && (
                            <button
                                className="pill bg-gray-600"
                                disabled
                            >
                                Pending Approval
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Network Configuration */}
            <div className="card-animated p-4 mb-4">
                <div className="text-gray-400 text-sm mb-2">Network Configuration</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <Field label="Owner Email">
                            <input
                                className="search-input w-full rounded-md px-3 py-2"
                                type="email"
                                value={networkSettings.owner_email}
                                onChange={(e) => updateSetting('owner_email', e.target.value)}
                                placeholder="Enter owner email to join network"
                            />
                        </Field>
                        <div className="text-xs text-gray-500 mt-1">
                            Required to join the PRIMUS network
                        </div>
                    </div>
                    <div>
                        <Field label="Network Features">
                            <div className="space-y-2">
                                <Toggle
                                    label="Shared Resources"
                                    value={networkSettings.shared_resources}
                                    onChange={(value) => updateSetting('shared_resources', value)}
                                />
                                <Toggle
                                    label="Data Synchronization"
                                    value={networkSettings.data_sync}
                                    onChange={(value) => updateSetting('data_sync', value)}
                                />
                                <Toggle
                                    label="Remote Support"
                                    value={networkSettings.remote_support}
                                    onChange={(value) => updateSetting('remote_support', value)}
                                />
                            </div>
                        </Field>
                    </div>
                </div>
            </div>

            {/* Network Benefits */}
            <div className="card-animated p-4">
                <div className="text-gray-400 text-sm mb-2">Network Benefits</div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="text-center">
                        <div className="text-2xl mb-2">📊</div>
                        <div className="text-white text-sm font-medium">Shared Analytics</div>
                        <div className="text-xs text-gray-400 mt-1">
                            Access network-wide performance data
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl mb-2">🔧</div>
                        <div className="text-white text-sm font-medium">Remote Support</div>
                        <div className="text-xs text-gray-400 mt-1">
                            Get help from network administrators
                        </div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl mb-2">📈</div>
                        <div className="text-white text-sm font-medium">Performance Insights</div>
                        <div className="text-xs text-gray-400 mt-1">
                            Benchmark against other centers
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6">
                <button
                    className="pill"
                    onClick={saveNetworkSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function Row({ children }) { return <div className="border-t border-white/10 py-3 flex items-center justify-between">{children}</div>; }

function UserDetails() {
    const [userFieldSettings, setUserFieldSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const fieldDefinitions = [
        {
            key: 'username',
            label: 'Username',
            type: 'text',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'password',
            label: 'Password',
            type: 'password',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: true, required: true }
        },
        {
            key: 'profile_photo',
            label: 'Profile Photo',
            type: 'file',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'user_group',
            label: 'User Group',
            type: 'select',
            defaultAdmin: { visible: true, required: true },
            defaultClient: { visible: false, required: false }
        },
        {
            key: 'notes',
            label: 'Notes',
            type: 'textarea',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: false, required: false }
        },
        {
            key: 'first_name',
            label: 'First Name',
            type: 'text',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'last_name',
            label: 'Last Name',
            type: 'text',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'date_of_birth',
            label: 'Date of Birth',
            type: 'date',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'phone_number',
            label: 'Phone Number',
            type: 'tel',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: true, required: false }
        },
        {
            key: 'post_pay_limit',
            label: 'Post Pay Limit',
            type: 'number',
            defaultAdmin: { visible: true, required: false },
            defaultClient: { visible: false, required: false }
        }
    ];

    useEffect(() => {
        loadUserFieldSettings();
    }, []);

    const loadUserFieldSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('user_fields');
            const settingsObj = settingsToObject(settings);

            // Initialize with defaults if no settings exist
            const initializedSettings = {};
            fieldDefinitions.forEach(field => {
                const adminKey = `${field.key}_admin`;
                const clientKey = `${field.key}_client`;

                initializedSettings[adminKey] = settingsObj[adminKey] || field.defaultAdmin;
                initializedSettings[clientKey] = settingsObj[clientKey] || field.defaultClient;
            });

            setUserFieldSettings(initializedSettings);
        } catch (error) {
            console.error('Failed to load user field settings:', error);
            showToast('Failed to load user field settings', 'error');

            // Initialize with defaults on error
            const defaultSettings = {};
            fieldDefinitions.forEach(field => {
                defaultSettings[`${field.key}_admin`] = field.defaultAdmin;
                defaultSettings[`${field.key}_client`] = field.defaultClient;
            });
            setUserFieldSettings(defaultSettings);
        } finally {
            setLoading(false);
        }
    };

    const saveUserFieldSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(userFieldSettings, 'user_fields');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('User field settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save user field settings:', error);
            showToast('Failed to save user field settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateFieldSetting = (fieldKey, interfaceType, settingType, value) => {
        const key = `${fieldKey}_${interfaceType}`;
        setUserFieldSettings(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [settingType]: value
            }
        }));
    };

    const resetToDefaults = () => {
        const defaultSettings = {};
        fieldDefinitions.forEach(field => {
            defaultSettings[`${field.key}_admin`] = field.defaultAdmin;
            defaultSettings[`${field.key}_client`] = field.defaultClient;
        });
        setUserFieldSettings(defaultSettings);
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/User details
                <div className="text-gray-400 text-sm mt-2">Loading settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/User details</div>

            <div className="card-animated p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-gray-300 text-sm">User Registration Form Configuration</div>
                        <div className="text-gray-500 text-xs mt-1">
                            Configure which fields appear on user registration and management forms
                        </div>
                    </div>
                    <button
                        className="pill bg-gray-600 hover:bg-gray-500"
                        onClick={resetToDefaults}
                    >
                        Reset to Defaults
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-gray-400 text-xs uppercase border-b border-white/10">
                                <th className="text-left py-2 px-1 w-1/4">Field Name</th>
                                <th className="text-left py-2 px-1 w-1/6">Field Type</th>
                                <th className="text-center py-2 px-1 w-1/4">Web-admin</th>
                                <th className="text-center py-2 px-1 w-1/4">Client App</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fieldDefinitions.map((field, i) => (
                                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-3 px-1">
                                        <div className="text-white font-medium">{field.label}</div>
                                    </td>
                                    <td className="py-3 px-1">
                                        <div className="text-gray-400 text-sm">{field.type}</div>
                                    </td>
                                    <td className="py-3 px-1">
                                        <div className="flex justify-center gap-2">
                                            <label className="pill text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mr-1"
                                                    checked={userFieldSettings[`${field.key}_admin`]?.visible || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'admin', 'visible', e.target.checked)}
                                                />
                                                Visible
                                            </label>
                                            <label className="pill text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mr-1"
                                                    checked={userFieldSettings[`${field.key}_admin`]?.required || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'admin', 'required', e.target.checked)}
                                                    disabled={!userFieldSettings[`${field.key}_admin`]?.visible}
                                                />
                                                Required
                                            </label>
                                        </div>
                                    </td>
                                    <td className="py-3 px-1">
                                        <div className="flex justify-center gap-2">
                                            <label className="pill text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mr-1"
                                                    checked={userFieldSettings[`${field.key}_client`]?.visible || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'client', 'visible', e.target.checked)}
                                                />
                                                Visible
                                            </label>
                                            <label className="pill text-xs">
                                                <input
                                                    type="checkbox"
                                                    className="mr-1"
                                                    checked={userFieldSettings[`${field.key}_client`]?.required || false}
                                                    onChange={(e) => updateFieldSetting(field.key, 'client', 'required', e.target.checked)}
                                                    disabled={!userFieldSettings[`${field.key}_client`]?.visible}
                                                />
                                                Required
                                            </label>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Field Requirements Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card-animated p-4">
                    <div className="text-gray-300 text-sm mb-3">Web-admin Required Fields</div>
                    <div className="space-y-1">
                        {fieldDefinitions
                            .filter(field => userFieldSettings[`${field.key}_admin`]?.required)
                            .map(field => (
                                <div key={field.key} className="text-white text-sm flex items-center">
                                    <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                    {field.label}
                                </div>
                            ))}
                    </div>
                </div>
                <div className="card-animated p-4">
                    <div className="text-gray-300 text-sm mb-3">Client Required Fields</div>
                    <div className="space-y-1">
                        {fieldDefinitions
                            .filter(field => userFieldSettings[`${field.key}_client`]?.required)
                            .map(field => (
                                <div key={field.key} className="text-white text-sm flex items-center">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                                    {field.label}
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            <div className="mt-6">
                <button
                    className="pill"
                    onClick={saveUserFieldSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}

function Licenses() {
    const [show, setShow] = useState(false);
    const [licensePools, setLicensePools] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        loadLicensePools();
    }, []);

    const loadLicensePools = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('licenses');
            const settingsObj = settingsToObject(settings);
            const pools = settingsObj.license_pools || [];
            setLicensePools(Array.isArray(pools) ? pools : []);
        } catch (error) {
            console.error('Failed to load license pools:', error);
            showToast('Failed to load license pools', 'error');
            setLicensePools([]);
        } finally {
            setLoading(false);
        }
    };

    const saveLicensePools = async (pools) => {
        try {
            const settingsToUpdate = [{
                category: 'licenses',
                key: 'license_pools',
                value: JSON.stringify(pools),
                value_type: 'json'
            }];
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            setLicensePools(pools);
            showToast('License pools updated successfully', 'success');
        } catch (error) {
            console.error('Failed to save license pools:', error);
            showToast('Failed to save license pools', 'error');
        }
    };

    const handleCreatePool = async (poolData) => {
        const newPool = {
            id: Date.now(), // Simple ID generation
            name: poolData.name,
            games: poolData.games,
            created_at: new Date().toISOString(),
            active: true
        };

        const updatedPools = [...licensePools, newPool];
        await saveLicensePools(updatedPools);
        setShow(false);
    };

    const handleDeletePool = async (poolId) => {
        setDeleting(poolId);
        try {
            const updatedPools = licensePools.filter(pool => pool.id !== poolId);
            await saveLicensePools(updatedPools);
        } catch (error) {
            console.error('Failed to delete license pool:', error);
            showToast('Failed to delete license pool', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const togglePoolStatus = async (poolId) => {
        const updatedPools = licensePools.map(pool =>
            pool.id === poolId ? { ...pool, active: !pool.active } : pool
        );
        await saveLicensePools(updatedPools);
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Licenses
                <div className="text-gray-400 text-sm mt-2">Loading license pools...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Licenses</div>

            <div className="card-animated p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-gray-300 text-sm">License Pools</div>
                        <div className="text-gray-500 text-xs mt-1">
                            Manage license pools for different games and applications
                        </div>
                    </div>
                    <button
                        className="btn-primary-neo px-3 py-1.5 rounded-md"
                        onClick={() => setShow(true)}
                    >
                        Create license pool
                    </button>
                </div>

                {licensePools.length === 0 ? (
                    <div className="text-gray-400 text-center py-8">
                        No license pools created yet. Click "Create license pool" to get started.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {licensePools.map((pool) => (
                            <div key={pool.id} className="border border-white/10 rounded-md p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <div className="text-white font-medium">{pool.name}</div>
                                            <div className={`px-2 py-1 rounded text-xs ${pool.active ? 'bg-green-600/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                                                }`}>
                                                {pool.active ? 'Active' : 'Inactive'}
                                            </div>
                                        </div>
                                        <div className="text-gray-400 text-sm mt-1">
                                            {pool.games?.length || 0} games • Created {new Date(pool.created_at).toLocaleDateString()}
                                        </div>
                                        {pool.games && pool.games.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {pool.games.slice(0, 5).map((game, index) => (
                                                    <span key={index} className="text-xs bg-white/10 px-2 py-1 rounded">
                                                        {game}
                                                    </span>
                                                ))}
                                                {pool.games.length > 5 && (
                                                    <span className="text-xs text-gray-500 px-2 py-1">
                                                        +{pool.games.length - 5} more
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            className={`pill text-xs ${pool.active ? 'bg-gray-600 hover:bg-gray-500' : 'bg-green-600 hover:bg-green-700'
                                                }`}
                                            onClick={() => togglePoolStatus(pool.id)}
                                        >
                                            {pool.active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            className="pill bg-red-600 hover:bg-red-700 text-xs"
                                            onClick={() => handleDeletePool(pool.id)}
                                            disabled={deleting === pool.id}
                                        >
                                            {deleting === pool.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* License Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">🎮</div>
                    <div className="text-white text-lg font-semibold">{licensePools.length}</div>
                    <div className="text-gray-400 text-sm">Total Pools</div>
                </div>
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">✅</div>
                    <div className="text-white text-lg font-semibold">
                        {licensePools.filter(p => p.active).length}
                    </div>
                    <div className="text-gray-400 text-sm">Active Pools</div>
                </div>
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">🎯</div>
                    <div className="text-white text-lg font-semibold">
                        {licensePools.reduce((total, pool) => total + (pool.games?.length || 0), 0)}
                    </div>
                    <div className="text-gray-400 text-sm">Games Covered</div>
                </div>
            </div>

            {show && <LicenseModal onClose={() => setShow(false)} onCreate={handleCreatePool} />}
        </div>
    );
}

function LicenseModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [selectedGames, setSelectedGames] = useState([]);
    const [filter, setFilter] = useState('');
    const [creating, setCreating] = useState(false);

    const options = [
        'Among Us', 'Apex Legends', 'Battle.net', 'Call of Duty: Modern Warfare II | Warzone™ 2.0',
        'Counter-Strike 2', 'Destiny 2', 'Discord', 'Display Settings', 'Dota 2',
        'Epic Games Launcher', 'Fall Guys', 'Fortnite', 'Google Chrome', 'League Of Legends',
        'Marvel Rivals', 'Minecraft', 'Overwatch 2', 'PUBG', 'Rainbow Six Siege',
        'Rocket League', 'Sea of Thieves', 'Steam', 'Team Fortress 2', 'Valorant',
        'World of Warcraft', 'Xbox Game Pass'
    ];

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(filter.toLowerCase())
    );

    const toggleGame = (game) => {
        setSelectedGames(prev =>
            prev.includes(game)
                ? prev.filter(g => g !== game)
                : [...prev, game]
        );
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            showToast('Please enter a pool name', 'error');
            return;
        }

        if (selectedGames.length === 0) {
            showToast('Please select at least one game', 'error');
            return;
        }

        setCreating(true);
        try {
            await onCreate({
                name: name.trim(),
                games: selectedGames
            });
            // Reset form
            setName('');
            setSelectedGames([]);
            setFilter('');
        } catch (error) {
            console.error('Failed to create license pool:', error);
        } finally {
            setCreating(false);
        }
    };

    const removeGame = (game) => {
        setSelectedGames(prev => prev.filter(g => g !== game));
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="calendar-pop w-[600px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="text-white text-lg font-semibold mb-3 flex items-center justify-between">
                    Create license pool
                    <button className="text-gray-400 hover:text-white" onClick={onClose}>✕</button>
                </div>

                <Field label="Pool Name *">
                    <input
                        className="search-input w-full rounded-md px-3 py-2"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter license pool name"
                    />
                </Field>

                {/* Selected Games */}
                {selectedGames.length > 0 && (
                    <div className="mb-4">
                        <div className="text-gray-300 text-sm mb-2">Selected Games ({selectedGames.length})</div>
                        <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                            {selectedGames.map(game => (
                                <div key={game} className="pill inline-flex items-center gap-2 bg-primary/20">
                                    <span className="text-sm">{game}</span>
                                    <button
                                        className="text-red-400 hover:text-red-300"
                                        onClick={() => removeGame(game)}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Field label="Available Games">
                    <input
                        className="search-input w-full rounded-md px-3 py-2 mb-2"
                        placeholder="Search games..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <div className="max-h-48 overflow-auto border border-white/10 rounded-md">
                        {filteredOptions.length === 0 ? (
                            <div className="px-3 py-4 text-gray-400 text-center">
                                No games found matching "{filter}"
                            </div>
                        ) : (
                            filteredOptions.map(option => {
                                const isSelected = selectedGames.includes(option);
                                return (
                                    <div
                                        key={option}
                                        className={`px-3 py-2 cursor-pointer border-b border-white/5 last:border-b-0 ${isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-white/10'
                                            }`}
                                        onClick={() => toggleGame(option)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleGame(option)}
                                                className="mr-2"
                                            />
                                            {option}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </Field>

                <div className="flex justify-end gap-2 mt-4">
                    <button
                        className="pill"
                        onClick={onClose}
                        disabled={creating}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn-primary-neo px-3 py-1.5 rounded-md"
                        onClick={handleCreate}
                        disabled={!name.trim() || selectedGames.length === 0 || creating}
                    >
                        {creating ? 'Creating...' : 'Create Pool'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CenterLanguage() {
    const [languageSettings, setLanguageSettings] = useState({
        default_language: 'en',
        supported_languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
        auto_detect_language: true,
        allow_user_language_selection: true,
        fallback_language: 'en'
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const languages = [
        { code: 'en', name: 'English', flag: '🇺🇸', native: 'English' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
        { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
        { code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
        { code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
        { code: 'pt', name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
        { code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵', native: '日本語' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷', native: '한국어' },
        { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
        { code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
        { code: 'nl', name: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
        { code: 'sv', name: 'Swedish', flag: '🇸🇪', native: 'Svenska' },
        { code: 'da', name: 'Danish', flag: '🇩🇰', native: 'Dansk' },
        { code: 'no', name: 'Norwegian', flag: '🇳🇴', native: 'Norsk' },
        { code: 'fi', name: 'Finnish', flag: '🇫🇮', native: 'Suomi' },
        { code: 'pl', name: 'Polish', flag: '🇵🇱', native: 'Polski' }
    ];

    useEffect(() => {
        loadLanguageSettings();
    }, []);

    const loadLanguageSettings = async () => {
        try {
            const settings = await settingsAPI.getSettingsByCategory('language');
            const settingsObj = settingsToObject(settings);

            setLanguageSettings(prev => ({
                ...prev,
                ...settingsObj,
                supported_languages: Array.isArray(settingsObj.supported_languages)
                    ? settingsObj.supported_languages
                    : prev.supported_languages
            }));
        } catch (error) {
            console.error('Failed to load language settings:', error);
            showToast('Failed to load language settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveLanguageSettings = async () => {
        setSaving(true);
        try {
            const settingsToUpdate = objectToSettings(languageSettings, 'language');
            await settingsAPI.bulkUpdateSettings(settingsToUpdate);
            showToast('Language settings saved successfully', 'success');
        } catch (error) {
            console.error('Failed to save language settings:', error);
            showToast('Failed to save language settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setLanguageSettings(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const toggleLanguage = (langCode) => {
        const current = languageSettings.supported_languages;
        const updated = current.includes(langCode)
            ? current.filter(code => code !== langCode)
            : [...current, langCode];

        // Ensure at least one language is supported
        if (updated.length === 0) {
            showToast('At least one language must be supported', 'error');
            return;
        }

        updateSetting('supported_languages', updated);

        // If default language is no longer supported, reset it
        if (!updated.includes(languageSettings.default_language)) {
            updateSetting('default_language', updated[0]);
        }

        // If fallback language is no longer supported, reset it
        if (!updated.includes(languageSettings.fallback_language)) {
            updateSetting('fallback_language', updated[0]);
        }
    };

    const getLanguageName = (code) => {
        const lang = languages.find(l => l.code === code);
        return lang ? `${lang.flag} ${lang.name} (${lang.native})` : code;
    };

    const getLanguageFlag = (code) => {
        const lang = languages.find(l => l.code === code);
        return lang ? lang.flag : '🏳️';
    };

    if (loading) {
        return (
            <div className="text-xl text-white font-semibold mb-4">
                Center/Language
                <div className="text-gray-400 text-sm mt-2">Loading language settings...</div>
            </div>
        );
    }

    return (
        <div>
            <div className="text-xl text-white font-semibold mb-4">Center/Language</div>

            {/* Language Configuration */}
            <div className="card-animated p-4 mb-4">
                <div className="text-gray-400 text-sm mb-2">Language Configuration</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <Field label="Default Language">
                            <select
                                className="search-input rounded-md px-3 py-2 w-full"
                                value={languageSettings.default_language}
                                onChange={(e) => updateSetting('default_language', e.target.value)}
                            >
                                {languageSettings.supported_languages.map(code => (
                                    <option key={code} value={code}>
                                        {getLanguageName(code)}
                                    </option>
                                ))}
                            </select>
                        </Field>

                        <Field label="Fallback Language">
                            <select
                                className="search-input rounded-md px-3 py-2 w-full"
                                value={languageSettings.fallback_language}
                                onChange={(e) => updateSetting('fallback_language', e.target.value)}
                            >
                                {languageSettings.supported_languages.map(code => (
                                    <option key={code} value={code}>
                                        {getLanguageName(code)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </div>

                    <div>
                        <div className="mb-4">
                            <div className="text-gray-300 text-sm mb-2">Language Detection</div>
                            <Toggle
                                label="Auto-detect user language"
                                value={languageSettings.auto_detect_language}
                                onChange={(value) => updateSetting('auto_detect_language', value)}
                            />
                            <Toggle
                                label="Allow users to select language"
                                value={languageSettings.allow_user_language_selection}
                                onChange={(value) => updateSetting('allow_user_language_selection', value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Supported Languages */}
            <div className="card-animated p-4 mb-4">
                <div className="text-gray-400 text-sm mb-2">
                    Supported Languages ({languageSettings.supported_languages.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {languages.map(lang => {
                        const isSupported = languageSettings.supported_languages.includes(lang.code);
                        const isDefault = languageSettings.default_language === lang.code;
                        const isFallback = languageSettings.fallback_language === lang.code;

                        return (
                            <div
                                key={lang.code}
                                className={`border rounded-md p-3 cursor-pointer transition-all ${isSupported
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-white/10 hover:border-white/20'
                                    }`}
                                onClick={() => toggleLanguage(lang.code)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{lang.flag}</span>
                                        <div>
                                            <div className="text-white text-sm font-medium">{lang.name}</div>
                                            <div className="text-gray-400 text-xs">{lang.native}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isDefault && (
                                            <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                                                Default
                                            </span>
                                        )}
                                        {isFallback && !isDefault && (
                                            <span className="text-xs bg-gray-600/20 text-gray-400 px-2 py-1 rounded">
                                                Fallback
                                            </span>
                                        )}
                                        <input
                                            type="checkbox"
                                            checked={isSupported}
                                            onChange={() => toggleLanguage(lang.code)}
                                            className="ml-2"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Language Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">🌍</div>
                    <div className="text-white text-lg font-semibold">
                        {languageSettings.supported_languages.length}
                    </div>
                    <div className="text-gray-400 text-sm">Supported Languages</div>
                </div>
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">{getLanguageFlag(languageSettings.default_language)}</div>
                    <div className="text-white text-sm font-medium">
                        {languages.find(l => l.code === languageSettings.default_language)?.name || languageSettings.default_language}
                    </div>
                    <div className="text-gray-400 text-xs">Default Language</div>
                </div>
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">{getLanguageFlag(languageSettings.fallback_language)}</div>
                    <div className="text-white text-sm font-medium">
                        {languages.find(l => l.code === languageSettings.fallback_language)?.name || languageSettings.fallback_language}
                    </div>
                    <div className="text-gray-400 text-xs">Fallback Language</div>
                </div>
                <div className="card-animated p-4 text-center">
                    <div className="text-2xl mb-2">
                        {languageSettings.auto_detect_language ? '🎯' : '⚙️'}
                    </div>
                    <div className="text-white text-sm font-medium">
                        {languageSettings.auto_detect_language ? 'Auto' : 'Manual'}
                    </div>
                    <div className="text-gray-400 text-xs">Language Detection</div>
                </div>
            </div>

            <div className="mt-6">
                <button
                    className="pill"
                    onClick={saveLanguageSettings}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save changes'}
                </button>
            </div>
        </div>
    );
}
