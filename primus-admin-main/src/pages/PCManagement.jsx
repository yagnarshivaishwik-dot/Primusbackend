import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MessageSquare } from 'lucide-react';
import { getApiBase, authHeaders, showToast } from '../utils/api';
import { eventStream } from '../utils/eventStream';
import ChatPanel from '../components/ChatPanel.jsx';
import Modal from '../components/common/Modal.jsx';
import Button from '../components/common/Button.jsx';

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
            const base = getApiBase().replace(/\/$/, '');
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
                    user_name: p.user_name || null,
                    session_start: p.session_start || null
                }));
            } catch (e1) {
                // /api/clientpc/ failed, fall back to /api/pc/
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
            // All PC fetches failed
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
            const base = getApiBase().replace(/\/$/, '');
            const payload = { pc_id: pcId, command: cmd, params: paramsObj ? JSON.stringify(paramsObj) : null };
            await axios.post(`${base}/api/command/send`, payload, { headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
            showToast(`Command '${cmd}' sent`);
        } catch (e) {
            showToast('Failed to send command');
        }
    };

    const handleCommand = () => {
        // Apply optimistic local-state change for lock/unlock; the real API
        // call happens via sendCmd from the per-PC action buttons.
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
            const base = getApiBase().replace(/\/$/, '');
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
                    <div className="text-xs text-gray-400">Today&apos;s income</div>
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
                    <div className="text-xs text-gray-400">Today&apos;s sales</div>
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
                            {/*
                              Capability gating intentionally removed.
                              The C# kiosk registers capabilities as a flat list
                              (e.g. ["screenshot","heartbeat","command"]) but
                              this UI used to read pc.capabilities.features.includes(...)
                              — a key that never existed, which either threw or
                              short-circuited every button to disabled.
                              The backend's ALLOWED_COMMANDS allowlist
                              (remote_command.py) is the actual source of truth;
                              here we just gate on whether the PC is reachable.
                              Defensive: only disable on an explicit offline
                              signal so an undefined `online` field (older
                              backend) doesn't lock every button.
                            */}
                            <Button
                                onClick={() => sendCmd(pc.id, 'lock')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.online === false || pc.status === 'offline'}
                            >Lock</Button>
                            <Button
                                onClick={() => sendCmd(pc.id, 'unlock')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.online === false || pc.status === 'offline'}
                            >Unlock</Button>
                            <Button
                                onClick={() => sendCmd(pc.id, 'restart')}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.online === false || pc.status === 'offline'}
                            >Restart</Button>
                            <Button
                                onClick={() => { const text = prompt('Message to display on PC'); if (text) sendCmd(pc.id, 'message', { text }); }}
                                variant="secondary"
                                className="flex-1 text-xs"
                                disabled={pc.online === false || pc.status === 'offline'}
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
                                <button className="w-full text-left px-3 py-2 hover:bg-gray-700 text-sm text-red-300" onClick={async () => { try { const base = getApiBase().replace(/\/$/, ''); await axios.delete(`${base}/api/clientpc/${pc.id}`, { headers: authHeaders() }); showToast('PC removed'); } catch { showToast('Failed to remove PC'); } finally { setMenuOpenId(null); fetchPcs(); } }}>Remove PC</button>
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

export default PCManagement;
