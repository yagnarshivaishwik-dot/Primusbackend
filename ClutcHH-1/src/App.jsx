import { useEffect, useState } from 'react';
import AppProviders from '@/app/providers/AppProviders';
import AppRoutes from '@/app/routes/AppRoutes';
import SetupPage from '@/features/auth/pages/SetupPage';
import { readDeviceCredentials } from '@/features/auth/services/handshakeService';
import { invoke, hasBridge, listen } from '@/app/bridge/invoke';
import { setJwt } from '@/app/bridge/config';
import useWalletStore from '@/app/store/useWalletStore';
import useSessionStore from '@/app/store/useSessionStore';
import useNotificationsStore from '@/app/store/useNotificationsStore';
import { audit } from '@/app/api/audit';
import LockScreen from '@/components/overlays/LockScreen';
import ChatWidget from '@/features/chat/components/ChatWidget';

/**
 * App states:
 *   'loading'        – checking device credentials with the native host
 *   'setup-required' – no credentials; show SetupPage
 *   'ready'          – credentials present; render main app
 *
 * When running outside the PrimusKiosk WebView2 host (e.g. `vite dev` in a
 * browser), there is no bridge and we fall straight through to 'ready' so
 * the React work can continue unblocked.
 */
export default function App() {
  const [setupState, setSetupState] = useState('loading');
  const [pcId, setPcId] = useState(null);
  const [lock, setLock] = useState({ locked: false, message: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasBridge()) {
        // Browser dev mode — skip the device gate.
        if (!cancelled) setSetupState('ready');
        return;
      }
      const creds = await readDeviceCredentials();
      if (cancelled) return;
      if (creds?.pc_id) {
        setPcId(creds.pc_id);
        setSetupState('ready');
      } else {
        setSetupState('setup-required');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate wallet + refresh user profile when setup is ready.
  //
  // Drop any stale JWT from a previous customer / install before we ask
  // /auth/me who's "signed in". Combined with useSessionStore no longer
  // persisting `user` (only `avatar`), this guarantees every fresh
  // kiosk launch lands on the login screen — no rehydration of the
  // last customer's identity. Mid-session reloads are rare and the
  // customer's wallet + progress are server-side, so re-login is cheap.
  useEffect(() => {
    if (setupState !== 'ready') return;
    setJwt(null);
    useWalletStore.getState().hydrate({ pcId });
    useSessionStore.getState().refreshMe().catch(() => {});
  }, [setupState, pcId]);

  // Kiosk lifecycle — register, enable shortcuts, start heartbeat. Runs once
  // we have device credentials, guards each call so a single native-side
  // failure doesn't wedge the whole app.
  useEffect(() => {
    if (setupState !== 'ready' || !hasBridge() || !pcId) return undefined;

    let stopped = false;
    let heartbeatHandle = null;

    const safeInvoke = async (cmd, args) => {
      try {
        return await invoke(cmd, args);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[kiosk] ${cmd} failed:`, err?.message || err);
        return null;
      }
    };

    (async () => {
      await safeInvoke('register_pc_with_backend');
      const setup = await safeInvoke('setup_complete_kiosk');
      await safeInvoke('enable_kiosk_shortcuts');
      // Start the WebSocket + long-poll pump that receives every remote
      // command (lock/unlock/message/shutdown/restart/screenshot/login/logout)
      // from the backend. Idempotent on the C# side.
      await safeInvoke('start_command_service');

      audit('kiosk.ready', {
        pc_id: pcId,
        shell_replaced: setup?.shell_replaced ?? false,
        has_admin_rights: setup?.has_admin_rights ?? false,
      });

      let heartbeatFailures = 0;
      const tick = async () => {
        if (stopped) return;
        const res = await safeInvoke('send_heartbeat');
        if (res && res.success === false) {
          heartbeatFailures += 1;
          if (heartbeatFailures === 1 || heartbeatFailures % 10 === 0) {
            audit('heartbeat.fail', { reason: res.reason, consecutive: heartbeatFailures });
          }
        } else if (res && res.success) {
          if (heartbeatFailures > 0) {
            audit('heartbeat.recovered', { after_failures: heartbeatFailures });
          }
          heartbeatFailures = 0;
          // Apply the authoritative remaining-time value the backend returned
          // so the Navbar timer stays in sync even when no realtime event fires.
          if (typeof res.remaining_time_seconds === 'number') {
            useWalletStore.getState().applyTimeEvent({
              remaining_seconds: res.remaining_time_seconds,
            });
          }
        }
      };
      await tick();
      heartbeatHandle = window.setInterval(tick, 20000);
    })();

    return () => {
      stopped = true;
      if (heartbeatHandle != null) window.clearInterval(heartbeatHandle);
    };
  }, [setupState, pcId]);

  // Realtime event listeners — subscribed once setup is complete. The
  // unlisten functions are awaited lazily so the cleanup path still works
  // even if the subscription is still pending when the effect tears down.
  useEffect(() => {
    if (setupState !== 'ready' || !hasBridge()) return undefined;

    const unlistens = [];
    const wire = async (name, handler) => {
      try {
        const off = await listen(name, handler);
        if (typeof off === 'function') unlistens.push(off);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[bridge] listen(${name}) failed:`, err?.message || err);
      }
    };

    const wallet = useWalletStore.getState();
    const notifStore = useNotificationsStore.getState();

    wire('connection_state_changed', () => {});
    wire('announcement', (ev) => {
      const p = ev?.payload;
      if (!p) return;
      notifStore.items.unshift({
        id: `a-${Date.now()}`,
        title: p.title || 'Announcement',
        body: p.content || p.body || '',
        unread: true,
        createdAt: new Date().toISOString(),
      });
      useNotificationsStore.setState({
        items: [...notifStore.items],
        unreadCount: (notifStore.unreadCount || 0) + 1,
      });
    });
    wire('wallet_updated', (ev) => wallet.applyWalletEvent(ev?.payload));
    wire('time_updated', (ev) => {
      const p = ev?.payload || {};
      if (typeof p.remaining_seconds === 'number' || typeof p.remainingSeconds === 'number') {
        wallet.applyTimeEvent(p);
      } else {
        // Server asked us to refetch (e.g. after a Cashfree webhook credited
        // new pack minutes). /billing/estimate-timeleft is authoritative.
        wallet.hydrate({ pcId });
      }
    });
    wire('payment_confirmed', () => wallet.hydrate({ pcId }));
    // chat_message is subscribed by <ChatWidget /> (mounted in App's return)
    // so it owns its own message list lifecycle. Keep no-op handler removed
    // here to avoid two-listener confusion.
    wire('pc_lock_state', (ev) => {
      const p = ev?.payload || {};
      setLock({ locked: !!p.locked, message: p.message || null });
      audit(p.locked ? 'kiosk.lock' : 'kiosk.unlock', { message: p.message });
    });

    return () => {
      unlistens.forEach((off) => {
        try {
          off();
        } catch {
          /* ignore */
        }
      });
    };
  }, [setupState]);

  // Ctrl+Shift+L — the admin "exit kiosk" shortcut. Un-hooks the keyboard,
  // un-hides the taskbar and minimises the kiosk window for 60 seconds so an
  // admin can reach the desktop. The lockdown re-enables itself automatically.
  useEffect(() => {
    if (setupState !== 'ready' || !hasBridge()) return undefined;
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        e.stopPropagation();
        invoke('kiosk_exit_temp', { duration_secs: 60 }).catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setupState]);

  if (setupState === 'loading') {
    return (
      <div className="min-h-screen w-full bg-[#0B0F14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-[#3ABEFF] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-300 text-sm tracking-wide uppercase">Initialising NoLag…</p>
        </div>
      </div>
    );
  }

  if (setupState === 'setup-required') {
    return (
      <SetupPage
        onComplete={async () => {
          // After a successful handshake the native host wrote a fresh
          // device.bin (PcId + DeviceSecret + LicenseKey). Re-read those
          // creds and set pcId in React state — otherwise the heartbeat /
          // command-pull loop below (gated on `!pcId`) never starts, and
          // the kiosk is "bound" on the backend but silent on the wire.
          try {
            const creds = await readDeviceCredentials();
            if (creds?.pc_id) setPcId(creds.pc_id);
          } catch {
            /* if this fails the next reload will pick it up */
          }
          setSetupState('ready');
        }}
      />
    );
  }

  return (
    <AppProviders>
      <AppRoutes />
      {/* Customer-side chat widget — floats on every authenticated route.
          Hides itself if no pcId (un-provisioned) or no user (logged out). */}
      <ChatWidget pcId={pcId} />
      {lock.locked && <LockScreen message={lock.message} />}
    </AppProviders>
  );
}
