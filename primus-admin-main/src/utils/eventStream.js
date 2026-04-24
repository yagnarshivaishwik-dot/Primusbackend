import { getApiBase } from './api';

class EventStreamManager {
    constructor() {
        this.eventSource = null;
        this.handlers = new Map();
        this.lastEventId = localStorage.getItem('primus_last_event_id') || '0';
        this.reconnectTimeout = 1000;
    }

    connect() {
        if (this.eventSource) {
            this.eventSource.close();
        }

        const token = localStorage.getItem('primus_jwt');
        if (!token) {
            console.warn('No JWT found, cannot connect to event stream');
            return;
        }

        const base = getApiBase().replace(/\/$/, "");
        const url = `${base}/api/admin/events/stream?last_event_id=${this.lastEventId}&token=${token}`;

        this.eventSource = new EventSource(url);

        this.eventSource.onmessage = (e) => {
            if (e.id) {
                this.lastEventId = e.id;
                localStorage.setItem('primus_last_event_id', e.id);
            }
            
            try {
                const data = JSON.parse(e.data);
                this.notifyHandlers(data.type, data);
            } catch (err) {
                // Not JSON (could be ping)
            }
        };

        this.eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            this.eventSource.close();
            
            // Automatic reconnection logic
            setTimeout(() => {
                console.log('Attempting to reconnect to event stream...');
                this.connect();
            }, this.reconnectTimeout);
            
            // Exponential backoff
            this.reconnectTimeout = Math.min(this.reconnectTimeout * 2, 30000);
        };

        this.eventSource.onopen = () => {
            console.log('SSE Connected');
            this.reconnectTimeout = 1000;
        };
    }

    subscribe(eventType, handler) {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType).add(handler);
        return () => this.unsubscribe(eventType, handler);
    }

    unsubscribe(eventType, handler) {
        if (this.handlers.has(eventType)) {
            this.handlers.get(eventType).delete(handler);
        }
    }

    notifyHandlers(eventType, data) {
        if (this.handlers.has(eventType)) {
            this.handlers.get(eventType).forEach(handler => handler(data));
        }
        // Also notify wildcard subscribers
        if (this.handlers.has('*')) {
            this.handlers.get('*').forEach(handler => handler(data));
        }
    }

    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }
}

export const eventStream = new EventStreamManager();
export default eventStream;

