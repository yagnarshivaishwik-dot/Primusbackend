import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';

/**
 * Consolidated HTTP client for the Primus web tier.
 *
 * Forensic audit P4 finding: three independent ~600-LOC API client
 * implementations existed across ClutcHH-1, primus-admin-main, and
 * Primus-SuperAdmin-main. Each had its own subtly-different bug surface
 * (BUG #1.2 mutable base, BUG #3.3 SSE-in-URL JWT, BUG #28 persisted
 * JWT). This module is the canonical replacement.
 *
 * Features:
 *  - 401 refresh interceptor (single-flight, exits cleanly on /refresh 401)
 *  - Offline queue keyed by `userId` (drops entries on identity flip)
 *  - Retry-After-aware backoff for 429/503
 *  - AbortController support via standard axios `signal`
 */

export interface ApiClientOptions {
  baseURL: string;
  /** Returns the in-memory access token. NEVER read from localStorage. */
  getToken: () => string | null;
  /** Stores a freshly minted access token in memory only. */
  setToken: (token: string | null) => void;
  /** Returns the current user id used to scope the offline queue. */
  getUserId: () => string | number | null;
  /** Refreshes the access token via httpOnly refresh-cookie / endpoint. */
  refreshAccessToken: () => Promise<string | null>;
  /** Where to persist offline queue. Defaults to localStorage. */
  queueStorageKey?: string;
  /** Called when refresh fails terminally; consumer can redirect to /login. */
  onAuthLost?: () => void;
}

export interface OfflineQueueEntry {
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data: unknown;
  headers: Record<string, string>;
  userId: string | number | null;
  ts: number;
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

interface RetryableConfig extends InternalAxiosRequestConfig {
  __primus_retried?: boolean;
  __primus_retry_count?: number;
}

function stripAuthHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'x-csrf-token' ||
      lower.startsWith('x-pc-')
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function parseRetryAfter(value: string | undefined): number {
  if (!value) return 0;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return 0;
}

export interface PrimusApiClient {
  instance: AxiosInstance;
  postWithQueue<T = unknown>(
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T | null>;
  flushQueue(): Promise<void>;
}

export function createApiClient(opts: ApiClientOptions): PrimusApiClient {
  const {
    baseURL,
    getToken,
    setToken,
    getUserId,
    refreshAccessToken,
    queueStorageKey = 'primus_offline_queue_v1',
    onAuthLost,
  } = opts;

  const instance = axios.create({
    baseURL,
    timeout: 30000,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
  });

  instance.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  let refreshInFlight: Promise<string | null> | null = null;
  async function singleFlightRefresh(): Promise<string | null> {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken()
        .then((tok) => {
          setToken(tok);
          return tok;
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return refreshInFlight;
  }

  instance.interceptors.response.use(
    (resp) => resp,
    async (error) => {
      const original = (error?.config || {}) as RetryableConfig;
      const status = error?.response?.status as number | undefined;
      const url = (original.url || '') as string;

      // 401 refresh path — never loop on /refresh / /login themselves.
      if (
        status === 401 &&
        !original.__primus_retried &&
        !url.includes('/auth/refresh') &&
        !url.includes('/auth/login')
      ) {
        original.__primus_retried = true;
        try {
          const newToken = await singleFlightRefresh();
          if (newToken) {
            original.headers = original.headers || {};
            original.headers.Authorization = `Bearer ${newToken}`;
            return instance(original);
          }
        } catch {
          /* fall through to onAuthLost */
        }
        setToken(null);
        if (onAuthLost) onAuthLost();
        return Promise.reject(error);
      }

      // 429 / 5xx with Retry-After — one retry only, honour the header.
      if (
        status !== undefined &&
        RETRYABLE_STATUSES.has(status) &&
        (original.__primus_retry_count || 0) < 1
      ) {
        original.__primus_retry_count = (original.__primus_retry_count || 0) + 1;
        const retryAfter = parseRetryAfter(
          error?.response?.headers?.['retry-after'],
        );
        const delay = retryAfter || Math.min(1000 * 2 ** (original.__primus_retry_count || 1), 8000);
        await new Promise((res) => setTimeout(res, delay));
        return instance(original);
      }

      return Promise.reject(error);
    },
  );

  function readQueue(): OfflineQueueEntry[] {
    try {
      return JSON.parse(localStorage.getItem(queueStorageKey) || '[]');
    } catch {
      return [];
    }
  }
  function writeQueue(q: OfflineQueueEntry[]): void {
    try {
      localStorage.setItem(queueStorageKey, JSON.stringify(q));
    } catch {
      // Per coding-style: never silently swallow. Surface via console.
      // eslint-disable-next-line no-console
      console.warn('[primus] offline queue persistence failed');
    }
  }

  async function postWithQueue<T = unknown>(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
  ): Promise<T | null> {
    try {
      const res = await instance.post<T>(url, data, config);
      return res.data;
    } catch {
      const q = readQueue();
      q.push({
        url,
        method: 'POST',
        data,
        headers: stripAuthHeaders(config.headers as Record<string, string>),
        userId: getUserId(),
        ts: Date.now(),
      });
      writeQueue(q);
      return null;
    }
  }

  async function flushQueue(): Promise<void> {
    const q = readQueue();
    if (!q.length) return;
    const next: OfflineQueueEntry[] = [];
    const currentUserId = getUserId();
    for (const item of q) {
      if (
        currentUserId == null ||
        item.userId == null ||
        String(item.userId) !== String(currentUserId)
      ) {
        // Drop foreign entries — preventing the queue-replay-across-identity
        // bug (FE-C4 forensic finding).
        continue;
      }
      try {
        await instance.request({
          url: item.url,
          method: item.method,
          data: item.data,
          headers: item.headers,
        });
      } catch {
        next.push(item);
      }
    }
    writeQueue(next);
  }

  return { instance, postWithQueue, flushQueue };
}
