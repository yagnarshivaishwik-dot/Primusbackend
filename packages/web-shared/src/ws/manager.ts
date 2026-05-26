/**
 * Shared WebSocket reconnect manager.
 *
 * Forensic audit P4 extraction: each SPA shipped its own slightly
 * different reconnect loop (different backoff curves, no jitter, no
 * Page Visibility integration). This module centralizes the contract:
 *
 *  - First-frame auth: the token is sent in the FIRST payload after
 *    `onopen` so it never lands in URLs / proxy logs (BUG #3.3).
 *  - Exponential backoff with full jitter (Decorrelated Jitter
 *    variant — Marc Brooker, AWS Architecture Blog).
 *  - On `visibilitychange` → `visible`, force an immediate reconnect
 *    tick so a backgrounded tab catches up cleanly when the user
 *    returns.
 */

export interface WsManagerOptions {
  url: string;
  /** Returns the in-memory access token used for the auth frame. */
  getToken: () => string | null;
  onMessage: (event: MessageEvent) => void;
  /** Optional hook called once the auth frame has been ACK'd. */
  onAuthenticated?: () => void;
  /** Optional hook called whenever the socket closes. */
  onClose?: (event: CloseEvent) => void;
  /** Max number of reconnect attempts before giving up. Default: 12. */
  maxRetries?: number;
  /** Initial backoff in ms. Default: 1000. */
  baseDelayMs?: number;
  /** Hard ceiling on the delay in ms. Default: 30_000. */
  capDelayMs?: number;
}

export interface WsManager {
  connect: () => void;
  disconnect: () => void;
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  isOpen: () => boolean;
}

export function createWsManager(opts: WsManagerOptions): WsManager {
  const {
    url,
    getToken,
    onMessage,
    onAuthenticated,
    onClose,
    maxRetries = 12,
    baseDelayMs = 1000,
    capDelayMs = 30000,
  } = opts;

  let socket: WebSocket | null = null;
  let retries = 0;
  let lastDelay = baseDelayMs;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function nextDelay(): number {
    // Decorrelated jitter: sleep = random_between(base, prev * 3), capped.
    const max = Math.min(capDelayMs, lastDelay * 3);
    const delay = Math.floor(baseDelayMs + Math.random() * (max - baseDelayMs));
    lastDelay = delay;
    return delay;
  }

  function scheduleReconnect(): void {
    if (stopped || retries >= maxRetries) return;
    retries += 1;
    const delay = nextDelay();
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect(): void {
    if (stopped || socket) return;
    const token = getToken();
    if (!token) {
      // Without a token we cannot pass the first-frame auth — back off
      // and retry. The consumer SPA usually triggers `connect()` again
      // after `setToken()`.
      scheduleReconnect();
      return;
    }

    const sock = new WebSocket(url);
    socket = sock;

    sock.addEventListener('open', () => {
      retries = 0;
      lastDelay = baseDelayMs;
      // First-frame auth: token in the BODY of the first message.
      sock.send(
        JSON.stringify({
          event: 'auth',
          payload: { token },
          ts: Math.floor(Date.now() / 1000),
        }),
      );
    });

    sock.addEventListener('message', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data?.event === 'auth.success' && onAuthenticated) {
          onAuthenticated();
        }
      } catch {
        /* non-JSON ping frames are forwarded as-is */
      }
      onMessage(event as MessageEvent);
    });

    sock.addEventListener('close', (event) => {
      socket = null;
      if (onClose) onClose(event as CloseEvent);
      // 1000 = normal closure; don't reconnect on it.
      if ((event as CloseEvent).code !== 1000) {
        scheduleReconnect();
      }
    });

    sock.addEventListener('error', () => {
      // The close handler will do the reconnect; nothing to do here.
    });
  }

  function disconnect(): void {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close(1000, 'Normal closure');
      socket = null;
    }
  }

  function send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  }

  function isOpen(): boolean {
    return Boolean(socket && socket.readyState === WebSocket.OPEN);
  }

  // Page Visibility tick: when the tab becomes visible again, give the
  // socket a kick so we don't sit on a stale half-open connection.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !isOpen() && !stopped) {
        retries = 0;
        lastDelay = baseDelayMs;
        connect();
      }
    });
  }

  return { connect, disconnect, send, isOpen };
}
