/**
 * Bridge wrapper for the C# PrimusKiosk host.
 *
 * The host injects `window.__TAURI__` before any page script runs (see
 * PrimusKiosk.App/WebHost/Bridge/JsBridge.cs::InvokeShim). This module is the
 * ONLY place the React app talks to native code — every `invoke(cmd, args)`
 * call goes through here so we get consistent error shaping, timeouts, and
 * a single dev-mode warning path when the bridge is absent (e.g. `vite dev`).
 */

const DEV_WARN_ONCE = new Set();

function warnMissingBridge(cmd) {
  if (DEV_WARN_ONCE.has(cmd)) return;
  DEV_WARN_ONCE.add(cmd);
  // eslint-disable-next-line no-console
  console.warn(
    `[bridge] window.__TAURI__.invoke unavailable — "${cmd}" will reject. ` +
      `Running outside the PrimusKiosk WebView2 host?`,
  );
}

export function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.__TAURI__ === 'object' &&
    typeof window.__TAURI__.invoke === 'function'
  );
}

/**
 * Invoke a host command. Rejects if the host is absent or the command fails.
 * @template T
 * @param {string} cmd
 * @param {Record<string, unknown>} [args]
 * @returns {Promise<T>}
 */
export async function invoke(cmd, args) {
  if (!hasBridge()) {
    warnMissingBridge(cmd);
    throw new Error(`Native bridge unavailable for command: ${cmd}`);
  }
  return window.__TAURI__.invoke(cmd, args || {});
}

/**
 * Subscribe to a host-pushed event.
 * Returns an unlisten function; calling it detaches the handler.
 * @param {string} eventName
 * @param {(ev: { event: string, payload: unknown }) => void} handler
 * @returns {Promise<() => void>}
 */
export async function listen(eventName, handler) {
  if (!hasBridge() || !window.__TAURI__.event || typeof window.__TAURI__.event.listen !== 'function') {
    warnMissingBridge(`event:${eventName}`);
    return () => {};
  }
  return window.__TAURI__.event.listen(eventName, handler);
}

export default invoke;
