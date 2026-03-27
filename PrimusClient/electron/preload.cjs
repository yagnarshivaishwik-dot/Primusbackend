const { contextBridge, ipcRenderer } = require('electron');

// Expose Electron APIs to the renderer process
// This creates a bridge that mimics Tauri's invoke() API

contextBridge.exposeInMainWorld('__TAURI__', {
    invoke: async (command, args = {}) => {
        // Map Tauri command names to Electron IPC handlers
        switch (command) {
            case 'generate_hardware_fingerprint':
                return await ipcRenderer.invoke('generate_hardware_fingerprint');

            case 'hmac_sha256':
                return await ipcRenderer.invoke('hmac_sha256', args.key, args.message);

            case 'get_system_info':
                return await ipcRenderer.invoke('get_system_info');

            case 'save_device_credentials':
                return await ipcRenderer.invoke('save_device_credentials', args);

            case 'get_device_credentials':
                return await ipcRenderer.invoke('get_device_credentials');

            case 'enable_kiosk_shortcuts':
                return await ipcRenderer.invoke('enable_kiosk_shortcuts');

            case 'disable_kiosk_shortcuts':
                return await ipcRenderer.invoke('disable_kiosk_shortcuts');

            case 'check_backend_connection':
                return await ipcRenderer.invoke('check_backend_connection', args.url || args);

            case 'register_pc_with_backend':
                return await ipcRenderer.invoke('register_pc_with_backend');

            case 'setup_complete_kiosk':
                return await ipcRenderer.invoke('setup_complete_kiosk');

            case 'cleanup_closed_apps':
                return await ipcRenderer.invoke('cleanup_closed_apps');

            case 'manage_window_focus':
                return await ipcRenderer.invoke('manage_window_focus');

            case 'launch_game':
                return await ipcRenderer.invoke('launch_game', args.exe_path || args);

            case 'browse_for_game':
                return await ipcRenderer.invoke('browse_for_game');

            case 'detect_installed_games':
                return await ipcRenderer.invoke('detect_installed_games');

            // Kiosk mode commands
            case 'enable_kiosk_mode':
                return await ipcRenderer.invoke('enable_kiosk_shortcuts');

            case 'disable_kiosk_mode':
                return await ipcRenderer.invoke('disable_kiosk_shortcuts');

            case 'check_kiosk_status':
                return 'Electron kiosk mode';

            // Placeholder commands that are handled differently in Electron
            case 'show_notification':
                // Use Electron's notification API
                new Notification(args.title || 'Primus', { body: args.body || '' });
                return;

            // ===== SYSTEM CONTROL COMMANDS =====
            case 'system_shutdown':
                return await ipcRenderer.invoke('system_shutdown');

            case 'system_restart':
                return await ipcRenderer.invoke('system_restart');

            case 'system_lock':
                return await ipcRenderer.invoke('system_lock');

            case 'system_logoff':
                return await ipcRenderer.invoke('system_logoff');

            case 'system_cancel_shutdown':
                return await ipcRenderer.invoke('system_cancel_shutdown');

            case 'enable_autostart':
                return await ipcRenderer.invoke('enable_autostart');

            case 'disable_autostart':
                return await ipcRenderer.invoke('disable_autostart');

            default:
                console.warn(`Unknown Tauri command: ${command}`, args);
                return null;
        }
    }
});

// Also expose a Tauri-like API structure for compatibility
contextBridge.exposeInMainWorld('__TAURI_IPC__', {
    invoke: async (cmd, args) => {
        return await ipcRenderer.invoke(cmd, args);
    }
});

// Expose tauri module for imports
contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', {
    invoke: async (command, args) => {
        // Same as above, just another entry point
        return await ipcRenderer.invoke(command, args);
    }
});
