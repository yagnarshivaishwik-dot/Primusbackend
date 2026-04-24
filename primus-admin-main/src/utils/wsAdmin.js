import { getApiBase } from './api';

class AdminWebSocketManager {
    constructor() {
        this.socket = null;
        this.subscribers = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 3000;
        this.isAuthenticated = false;
        this.isConnecting = false;
        this.pingInterval = null;
    }

    getWsUrl() {
        // Use the API base but convert http/https to ws/wss
        const base = getApiBase().replace(/^http/, 'ws').replace(/\/$/, '');
        return `${base}/ws/admin`;
    }

    connect() {
        if (this.socket || this.isConnecting) return;

        const token = localStorage.getItem('primus_jwt');
        if (!token) {
            console.warn('[WS] No JWT found, cannot connect to admin WebSocket');
            return;
        }

        this.isConnecting = true;
        const url = this.getWsUrl();
        console.log(`[WS] Connecting to ${url}...`);

        try {
            this.socket = new WebSocket(url);

            this.socket.onopen = () => {
                console.log('[WS] Connected');
                this.isConnecting = false;
                this.reconnectAttempts = 0;

                // Send the mandatory auth message as the first frame
                this.socket.send(JSON.stringify({
                    event: 'auth',
                    payload: { token },
                    ts: Math.floor(Date.now() / 1000)
                }));

                // Start a simple heartbeat to keep connection alive if needed
                this.startPing();
            };

            this.socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // The backend currently doesn't send auth.success, but if it did:
                    if (data.event === 'auth.success') {
                        this.isAuthenticated = true;
                    } else if (data.event === 'auth.error') {
                        console.error('[WS] Auth Error:', data.payload?.reason || 'unauthorized');
                        this.socket.close();
                        return;
                    }

                    // Notify all subscribers of the message
                    this.subscribers.forEach(callback => {
                        try {
                            callback(data);
                        } catch (err) {
                            console.error('[WS] Subscriber callback error:', err);
                        }
                    });
                } catch (err) {
                    // Ignore non-JSON messages (like pings)
                }
            };

            this.socket.onclose = (event) => {
                this.socket = null;
                this.isConnecting = false;
                this.isAuthenticated = false;
                this.stopPing();
                
                console.log(`[WS] Connection closed (code: ${event.code})`);

                // Attempt reconnection unless it was a normal closure
                if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = this.reconnectInterval * Math.min(this.reconnectAttempts, 5);
                    console.log(`[WS] Reconnecting in ${delay}ms... (Attempt ${this.reconnectAttempts})`);
                    setTimeout(() => this.connect(), delay);
                }
            };

            this.socket.onerror = (error) => {
                console.error('[WS] WebSocket error:', error);
                // socket.onclose will handle the reconnection
            };

        } catch (err) {
            this.isConnecting = false;
            console.error('[WS] Fatal connection error:', err);
        }
    }

    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                // Send a lightweight ping event if the backend supports it, 
                // or just a string that the backend can ignore.
                this.socket.send(JSON.stringify({ event: 'heartbeat', ts: Math.floor(Date.now() / 1000) }));
            }
        }, 30000); // 30 seconds
    }

    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        
        // Auto-connect if not already
        if (!this.socket && !this.isConnecting) {
            this.connect();
        }

        return () => {
            this.subscribers.delete(callback);
        };
    }

    disconnect() {
        this.stopPing();
        if (this.socket) {
            this.socket.close(1000, "Normal closure");
            this.socket = null;
        }
        this.subscribers.clear();
        this.isConnecting = false;
        this.isAuthenticated = false;
    }
}

const adminWs = new AdminWebSocketManager();

/**
 * Higher-level subscription helper for components.
 * Returns an unsubscribe function.
 */
export const subscribe = (callback) => {
    return adminWs.subscribe(callback);
};

export default adminWs;

