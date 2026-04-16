import { create } from 'zustand';
import { commandService } from '../services/commandService';
import { apiClient } from '../services/apiClient';
import toast from 'react-hot-toast';
import API_URL from '../config/api';

export interface SystemMetrics {
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
  gpuPercent?: number;
  temperature?: number;
}

export interface PCInfo {
  id: number;
  name: string;
  status: 'online' | 'offline' | 'in_use' | 'locked';
  last_seen?: string;
  current_user_id?: number;
  device_id?: string;
}

export interface SystemNotification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number;
}

interface SystemState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  needsHandshake: boolean; // True when credentials are invalid and re-registration is needed

  // System info
  pcInfo: PCInfo | null;
  systemMetrics: SystemMetrics | null;

  // Notifications
  notifications: SystemNotification[];

  // Lock / time state
  isLocked: boolean;
  lockMessage?: string | null;
  remainingMinutes?: number | null;
  remainingSeconds?: number | null;

  // Chat state (simple in-memory + localStorage cache)
  chatMessages: {
    id: string;
    pcId?: number;
    fromUserId?: number;
    toUserId?: number;
    text: string;
    timestamp: string;
    status: 'read' | 'unread';
  }[];

  // Settings
  backendUrl: string;
  licenseKey: string;

  // Actions
  initialize: () => Promise<void>;
  sendHeartbeat: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  updateSystemMetrics: (_metrics: SystemMetrics) => void;
  addNotification: (_notification: Omit<SystemNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (_id: string) => void;
  clearNotifications: () => void;
  updateSettings: (_settings: { backendUrl?: string; licenseKey?: string }) => void;
  registerPC: () => Promise<boolean>;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  needsHandshake: false,
  pcInfo: null,
  systemMetrics: null,
  notifications: [],
  remainingSeconds: null,
  chatMessages: [],
  isLocked: false,
  lockMessage: null,
  remainingMinutes: null,
  backendUrl: API_URL,
  licenseKey: import.meta.env.VITE_LICENSE_KEY || '',

  initialize: async (): Promise<void> => {
    try {
      set({ isConnecting: true, connectionError: null });

      // Load settings from storage if available
      const savedSettings = localStorage.getItem('primus-system-settings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          set({
            backendUrl: settings.backendUrl || get().backendUrl,
            licenseKey: settings.licenseKey || get().licenseKey,
          });
        } catch (parseError) {
          console.error('Failed to parse saved settings:', parseError);
        }
      }

      // Load cached remaining time and chat messages (best-effort)
      try {
        const savedTime = localStorage.getItem('primus-remaining-time');
        if (savedTime) {
          const parsed = JSON.parse(savedTime);
          set({
            remainingSeconds: parsed.remainingSeconds ?? null,
            remainingMinutes:
              typeof parsed.remainingSeconds === 'number'
                ? Math.floor(parsed.remainingSeconds / 60)
                : null,
          });
        }
      } catch (e) {
        console.warn('Failed to load cached remaining time', e);
      }
      try {
        const savedChat = localStorage.getItem('primus-chat-messages');
        if (savedChat) {
          const parsed = JSON.parse(savedChat);
          if (Array.isArray(parsed)) {
            set({ chatMessages: parsed });
          }
        }
      } catch (e) {
        console.warn('Failed to load cached chat messages', e);
      }

      // Configure API client
      apiClient.defaults.baseURL = get().backendUrl + '/api';

      // Start the long-polling command service
      commandService.onEvent((event: any) => handleWebSocketMessage(event, { set, get } as any));
      commandService.onConnectionChange((connected: boolean) => {
        set({
          isConnected: connected,
          isConnecting: false,
          connectionError: connected ? null : 'Disconnected from backend',
        });
      });

      // NEW: Listen for re-handshake requests (when credentials are invalid/expired)
      commandService.onNeedHandshake(() => {
        console.log('[Primus] Re-handshake required - credentials invalid or expired');
        set({
          needsHandshake: true,
          isConnected: false,
          isConnecting: false,
          connectionError: 'Device credentials invalid. Please re-register.',
        });
        get().addNotification({
          type: 'warning',
          title: 'Re-registration Required',
          message: 'Your device credentials have expired or are invalid. Please set up the device again.',
          duration: 10000,
        });
      });

      const started = await commandService.start();

      // If commandService couldn't start (no credentials), set needsHandshake
      if (!started) {
        set({ needsHandshake: true, isConnecting: false });
      }

    } catch (error) {
      console.error('[Primus] System initialization failed:', error);
      // Don't fail completely - allow app to run in offline mode
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: 'Running in offline mode'
      });
    }
  },

  connect: async (): Promise<void> => {
    // Note: In long-polling mode, commandService handles this via initialize()
    await commandService.start();
  },

  disconnect: async (): Promise<void> => {
    try {
      commandService.stop();
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: null
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  },

  updateSystemMetrics: (metrics: SystemMetrics): void => {
    set({ systemMetrics: metrics });
  },

  addNotification: (notification: Omit<SystemNotification, 'id' | 'timestamp'>): void => {
    const newNotification: SystemNotification = {
      ...notification,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };

    set(state => ({
      notifications: [...state.notifications, newNotification]
    }));

    // Auto-remove notification after duration
    if (notification.duration) {
      setTimeout(() => {
        get().removeNotification(newNotification.id);
      }, notification.duration);
    }

    // Show toast notification
    const toastOptions = {
      duration: notification.duration || 4000,
    };

    switch (notification.type) {
      case 'success':
        toast.success(notification.message, toastOptions);
        break;
      case 'error':
        toast.error(notification.message, toastOptions);
        break;
      case 'warning':
        toast(notification.message, { ...toastOptions, icon: '⚠️' });
        break;
      default:
        toast(notification.message, toastOptions);
    }
  },

  removeNotification: (id: string): void => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }));
  },

  clearNotifications: (): void => {
    set({ notifications: [] });
  },

  updateSettings: (settings: { backendUrl?: string; licenseKey?: string }): void => {
    const currentState = get();
    const newSettings = {
      backendUrl: settings.backendUrl || currentState.backendUrl,
      licenseKey: settings.licenseKey || currentState.licenseKey,
    };

    set(newSettings);

    // Save to localStorage
    localStorage.setItem('primus-system-settings', JSON.stringify(newSettings));

    // Update API client base URL
    if (settings.backendUrl) {
      apiClient.defaults.baseURL = settings.backendUrl + '/api';
    }
  },

  registerPC: async (): Promise<boolean> => {
    const { addNotification } = get();

    try {
      console.log('[Primus] Starting PC registration...');
      console.log('[Primus] Backend URL:', get().backendUrl);

      // Get system info from Tauri (with fallback)
      let systemInfo: any = { hostname: 'Unknown PC', os: 'Windows', arch: 'x64' };
      try {
        systemInfo = await getSystemInfo();
        console.log('[Primus] System info:', systemInfo);
      } catch (sysErr) {
        console.warn('[Primus] Failed to get system info, using defaults:', sysErr);
      }

      const registrationData = {
        name: systemInfo.hostname || 'Unknown PC',
        ip_address: '127.0.0.1', // Will be updated by backend
        // Required by backend ClientPCCreate model - use empty string as backend accepts fallback
        license_key: get().licenseKey || '',
        // Extra metadata
        status: 'online',
        os_info: systemInfo.os || 'Windows',
        arch: systemInfo.arch || 'x64',
        client_version: '1.0.0',
        last_seen: new Date().toISOString(),
      };

      console.log('[Primus] Registration data:', registrationData);

      const headers: Record<string, string> = {};
      if (systemInfo.deviceId) {
        headers['X-Device-Id'] = systemInfo.deviceId;
      }

      const response = await apiClient.post<PCInfo>('/clientpc/register', registrationData, {
        headers,
      });

      console.log('[Primus] Registration response:', response.data);

      set({ pcInfo: response.data });

      addNotification({
        type: 'success',
        title: 'PC Registered',
        message: `PC registered as "${response.data.name}"`,
        duration: 3000,
      });

      return true;
    } catch (error: any) {
      console.error('[Primus] PC registration failed:', error);
      console.error('[Primus] Error details:', error?.response?.data || error?.message);
      addNotification({
        type: 'error',
        title: 'Registration Failed',
        message: error?.response?.data?.detail || error?.message || 'Could not register PC',
        duration: 5000,
      });
      return false;
    }
  },

  sendHeartbeat: async (): Promise<void> => {
    const { pcInfo } = get();

    if (!pcInfo) return;

    try {
      // Backend heartbeat endpoint: POST /api/clientpc/heartbeat/{pc_id}
      await apiClient.post(`/clientpc/heartbeat/${pcInfo.id}`);
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  },
}));

// Helper function to handle WebSocket messages
function handleWebSocketMessage(
  message: any,
  { set, get }: { set: any; get: () => SystemState }
) {
  const { addNotification, pcInfo } = get();

  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;

    const eventType: string | undefined = data.event || data.type;

    switch (eventType) {
      case 'command':
        handleRemoteCommand(data, { addNotification, set });
        break;

      case 'timeleft':
        handleTimeLeftWarning(data, { addNotification, set });
        break;

      case 'pc.time.update': {
        const payload = data.payload || {};
        const clientId = payload.client_id;
        if (clientId && pcInfo && clientId !== pcInfo.id) break;
        const seconds = payload.remaining_time_seconds;
        if (typeof seconds === 'number') {
          const minutes = Math.floor(seconds / 60);
          set({ remainingSeconds: seconds, remainingMinutes: minutes });
          try {
            localStorage.setItem(
              'primus-remaining-time',
              JSON.stringify({ remainingSeconds: seconds })
            );
          } catch { /* ignore localStorage errors */ }
          addNotification({
            type: 'success',
            title: 'Time Updated',
            message: `Your remaining time is now ${minutes} minutes.`,
            duration: 4000,
          });
        }
        break;
      }

      case 'shop.purchase': {
        const payload = data.payload || {};
        const clientId = payload.client_id;
        if (clientId && pcInfo && clientId !== pcInfo.id) break;
        const newSeconds = payload.new_remaining_time;
        const minutesAdded = payload.minutes_added;
        if (typeof newSeconds === 'number') {
          const minutes = Math.floor(newSeconds / 60);
          set({ remainingSeconds: newSeconds, remainingMinutes: minutes });
          try {
            localStorage.setItem(
              'primus-remaining-time',
              JSON.stringify({ remainingSeconds: newSeconds })
            );
          } catch { }
        }
        if (minutesAdded) {
          addNotification({
            type: 'success',
            title: 'Purchase Applied',
            message: `Time pack applied: +${minutesAdded} minutes.`,
            duration: 5000,
          });
        }
        break;
      }

      case 'chat.message': {
        const payload = data.payload || {};
        const text = payload.text || payload.message;
        if (!text) break;
        const msg = {
          id:
            String(payload.message_id || payload.id || Date.now()) +
            Math.random().toString(36).slice(2),
          pcId: payload.client_id,
          fromUserId: payload.from_user_id,
          toUserId: payload.to_user_id,
          text,
          timestamp: new Date((payload.ts || Date.now()) * 1000).toISOString(),
          status: 'unread' as const,
        };
        set((state: SystemState) => {
          const all = [...state.chatMessages, msg];
          try {
            localStorage.setItem('primus-chat-messages', JSON.stringify(all));
          } catch { }
          return { chatMessages: all };
        });
        addNotification({
          type: 'info',
          title: 'New Message',
          message: text,
          duration: 6000,
        });
        break;
      }

      case 'message':
        addNotification({
          type: 'info',
          title: 'System Message',
          message: data.message || data.parameters,
          duration: 5000,
        });
        break;

      case 'notification':
        addNotification({
          type: data.level || 'info',
          title: data.title || 'Notification',
          message: data.message,
          duration: data.duration || 4000,
        });
        break;

      default:
        console.log('Unknown WebSocket message:', data);
    }
  } catch (error) {
    console.error('Failed to handle WebSocket message:', error);
  }
}

// Helper function to handle remote commands
function handleRemoteCommand(
  data: any,
  { addNotification, set }: { addNotification: (_n: any) => void; set: any }
) {
  const command = data.command?.toLowerCase();

  switch (command) {
    case 'shutdown':
      addNotification({
        type: 'warning',
        title: 'System Shutdown',
        message: 'System will shutdown shortly. Please save your work.',
        duration: 10000,
      });
      break;

    case 'restart':
      addNotification({
        type: 'warning',
        title: 'System Restart',
        message: 'System will restart shortly. Please save your work.',
        duration: 10000,
      });
      break;

    case 'lock':
      addNotification({
        type: 'info',
        title: 'System Locked',
        message: 'Your session has been locked.',
        duration: 3000,
      });
      set({
        isLocked: true,
        lockMessage: data.message || 'This PC has been locked by the administrator.',
      });
      break;

    case 'unlock':
      addNotification({
        type: 'info',
        title: 'System Unlocked',
        message: 'Your session has been unlocked.',
        duration: 3000,
      });
      set({
        isLocked: false,
        lockMessage: null,
      });
      break;

    default:
      console.log('Unknown remote command:', command);
  }
}

// Helper function to handle time left warnings
function handleTimeLeftWarning(
  data: any,
  { addNotification, set }: { addNotification: (_n: any) => void; set: any }
) {
  const minutes = data.minutes || 0;

  // Track remaining minutes in store for UI
  set({ remainingMinutes: minutes });

  if (minutes <= 0) {
    addNotification({
      type: 'error',
      title: 'Time Expired',
      message: 'Your session time has expired. Please add more time or your session will be locked.',
      duration: 10000,
    });
  } else if (minutes <= 1) {
    addNotification({
      type: 'warning',
      title: '1 Minute Remaining',
      message: 'Your session will expire in 1 minute. Please add more time.',
      duration: 8000,
    });
  } else if (minutes <= 5) {
    addNotification({
      type: 'warning',
      title: '5 Minutes Remaining',
      message: 'Your session will expire in 5 minutes. Please add more time.',
      duration: 6000,
    });
  }
}

// Helper functions
async function getSystemInfo(): Promise<any> {
  try {
    // Try to get system info from unified invoke wrapper
    const { invoke } = await import('../utils/invoke');
    const systemInfoStr = await invoke('get_system_info');
    return JSON.parse(systemInfoStr as string);
  } catch (error) {
    console.error('Failed to get system info:', error);
    return {
      hostname: 'Unknown PC',
      os: 'unknown',
      arch: 'unknown',
    };
  }
}

