// Unified invoke wrapper that works with both Tauri and Electron
// This file replaces direct imports from @tauri-apps/api/tauri
import { invoke as tauriInvoke } from '@tauri-apps/api/tauri';

/**
 * Invoke a backend command (works with both Tauri and Electron)
 * @param command - The command name
 * @param args - Optional arguments object
 */
export async function invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
    // Check for Electron's preload bridge (we expose __TAURI__ in preload.js)
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
        return await (window as any).__TAURI__.invoke(command, args);
    }

    // Fallback for native Tauri (window.__TAURI_INTERNALS__)
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__?.invoke) {
        return await (window as any).__TAURI_INTERNALS__.invoke(command, args);
    }

    // Use static import from @tauri-apps/api (Best reliability for bundled production apps)
    try {
        return await tauriInvoke(command, args);
    } catch (e) {
        console.error(`Failed to invoke "${command}":`, e);

        // Final fallback: check for window.__TAURI__ (if withGlobalTauri is enabled)
        if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
            return await (window as any).__TAURI__.invoke(command, args);
        }

        throw new Error(`Native invoke unavailable for command: ${command}`);
    }
}

export default invoke;
