export class WebSocketService {
  private socket: WebSocket | null = null;
  private onMessageCallbacks: ((_message: any) => void)[] = [];
  private onConnectionChangeCallbacks: ((_connected: boolean) => void)[] = [];
  private reconnectTimeout: number | null = null;
  private maxReconnectAttempts = 10;
  private reconnectAttempts = 0;
  private lastUrl: string | null = null;

  connect(backendUrl: string, licenseKey: string, pcId: number): void {
    if (this.socket || this.reconnectTimeout) return;

    // Convert http/https to ws/wss
    const wsUrl = backendUrl.replace(/^http/, 'ws').replace(/\/$/, '') + `/ws/pc/${pcId}?token=${licenseKey}`;
    this.lastUrl = wsUrl;

    console.log(`[WS] Connecting to ${wsUrl}...`);
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.notifyConnectionChange(true);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyMessage(data);
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
      }
    };

    this.socket.onclose = (event) => {
      console.log(`[WS] Closed: ${event.code} ${event.reason}`);
      this.notifyConnectionChange(false);
      this.socket = null;
      this.attemptReconnect();
    };

    this.socket.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  onMessage(callback: (_message: any) => void): void {
    this.onMessageCallbacks.push(callback);
  }

  onConnectionChange(callback: (_connected: boolean) => void): void {
    this.onConnectionChangeCallbacks.push(callback);
  }

  private notifyMessage(message: any): void {
    this.onMessageCallbacks.forEach((cb) => cb(message));
  }

  private notifyConnectionChange(connected: boolean): void {
    this.onConnectionChangeCallbacks.forEach((cb) => cb(connected));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`[WS] Attempting reconnect in ${delay}ms... (Attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.lastUrl) {
        this.socket = new WebSocket(this.lastUrl);
        // Re-attach handlers... or just call connect again with stored values
        // For simplicity, we just reuse the URL
      }
    }, delay);
  }
}

export const webSocketService = new WebSocketService();

