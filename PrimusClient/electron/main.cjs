const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');

// Environment
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Kiosk mode state
let kioskModeActive = false;
let mainWindow = null;

// Device credentials storage path
const getCredentialsPath = () => {
    const appData = app.getPath('userData');
    return path.join(appData, 'device_credentials.json');
};

// Create main window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        // Kiosk settings (can be toggled)
        kiosk: !isDev,
        fullscreen: !isDev,
        frame: isDev,
        alwaysOnTop: !isDev,
        skipTaskbar: !isDev,
        resizable: isDev,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
            webSecurity: true,
        }
    });

    // Load the app
    if (isDev) {
        // Development: load from Vite dev server
        mainWindow.loadURL('http://localhost:1420');
        mainWindow.webContents.openDevTools();
    } else {
        // Production: load built files
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Prevent window close in kiosk mode (unless explicitly allowed)
    mainWindow.on('close', (e) => {
        if (kioskModeActive && !isDev) {
            e.preventDefault();
        }
    });
}

// === IPC HANDLERS (equivalent to Tauri commands) ===

// Generate hardware fingerprint
ipcMain.handle('generate_hardware_fingerprint', async () => {
    const hostname = os.hostname();
    const cpus = os.cpus();
    const cpuInfo = cpus.length > 0 ? cpus[0].model : 'unknown';
    const totalMemory = os.totalmem().toString();
    const arch = os.arch();

    const rawId = `${hostname}-${cpuInfo}-${totalMemory}-${arch}`;
    const hash = crypto.createHash('sha256').update(rawId).digest('hex');
    return hash;
});

// HMAC SHA256
ipcMain.handle('hmac_sha256', async (event, key, message) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(message);
    return hmac.digest('hex');
});

// Get system info
ipcMain.handle('get_system_info', async () => {
    return JSON.stringify({
        os: os.platform(),
        arch: os.arch(),
        hostname: os.hostname()
    });
});

// Save device credentials
ipcMain.handle('save_device_credentials', async (event, { pcId, licenseKey, deviceSecret }) => {
    const credPath = getCredentialsPath();
    const creds = { pc_id: pcId, license_key: licenseKey, device_secret: deviceSecret };
    fs.writeFileSync(credPath, JSON.stringify(creds, null, 2));
    return 'Credentials saved';
});

// Get device credentials
ipcMain.handle('get_device_credentials', async () => {
    const credPath = getCredentialsPath();
    if (fs.existsSync(credPath)) {
        const data = fs.readFileSync(credPath, 'utf-8');
        return JSON.parse(data);
    }
    return null;
});

// Enable kiosk shortcuts (block system keys)
ipcMain.handle('enable_kiosk_shortcuts', async () => {
    kioskModeActive = true;

    if (mainWindow) {
        mainWindow.setKiosk(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.setSkipTaskbar(true);
    }

    // Block common escape shortcuts
    globalShortcut.register('Alt+Tab', () => { });
    globalShortcut.register('Alt+F4', () => { });
    globalShortcut.register('CommandOrControl+Alt+Delete', () => { });
    globalShortcut.register('Super', () => { });  // Windows key
    globalShortcut.register('Alt+Escape', () => { });

    return 'Kiosk shortcuts enabled';
});

// Disable kiosk shortcuts
ipcMain.handle('disable_kiosk_shortcuts', async () => {
    kioskModeActive = false;
    globalShortcut.unregisterAll();

    if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setSkipTaskbar(false);
    }

    return 'Kiosk shortcuts disabled';
});

// ===== SYSTEM CONTROL COMMANDS =====

// Shutdown the computer
ipcMain.handle('system_shutdown', async () => {
    console.log('[System] Executing shutdown...');
    return new Promise((resolve, reject) => {
        exec('shutdown /s /t 5 /c "Primus Client: Shutdown requested by admin"', (error) => {
            if (error) {
                reject(`Shutdown failed: ${error.message}`);
            } else {
                resolve('Shutdown initiated');
            }
        });
    });
});

// Restart the computer
ipcMain.handle('system_restart', async () => {
    console.log('[System] Executing restart...');
    return new Promise((resolve, reject) => {
        exec('shutdown /r /t 5 /c "Primus Client: Restart requested by admin"', (error) => {
            if (error) {
                reject(`Restart failed: ${error.message}`);
            } else {
                resolve('Restart initiated');
            }
        });
    });
});

// Lock the workstation
ipcMain.handle('system_lock', async () => {
    console.log('[System] Locking workstation...');
    return new Promise((resolve, reject) => {
        exec('rundll32.exe user32.dll,LockWorkStation', (error) => {
            if (error) {
                reject(`Lock failed: ${error.message}`);
            } else {
                resolve('Workstation locked');
            }
        });
    });
});

// Log off current user
ipcMain.handle('system_logoff', async () => {
    console.log('[System] Logging off user...');
    return new Promise((resolve, reject) => {
        exec('shutdown /l', (error) => {
            if (error) {
                reject(`Logoff failed: ${error.message}`);
            } else {
                resolve('Logoff initiated');
            }
        });
    });
});

// Cancel pending shutdown/restart
ipcMain.handle('system_cancel_shutdown', async () => {
    console.log('[System] Cancelling shutdown...');
    return new Promise((resolve, reject) => {
        exec('shutdown /a', (error) => {
            if (error) {
                reject(`Cancel failed: ${error.message}`);
            } else {
                resolve('Shutdown cancelled');
            }
        });
    });
});

// Set app to auto-start on Windows boot
ipcMain.handle('enable_autostart', async () => {
    const exePath = app.getPath('exe');
    const appName = 'PrimusClient';
    return new Promise((resolve, reject) => {
        exec(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /t REG_SZ /d "${exePath}" /f`, (error) => {
            if (error) {
                reject(`Failed to enable autostart: ${error.message}`);
            } else {
                resolve('Autostart enabled');
            }
        });
    });
});

// Disable auto-start
ipcMain.handle('disable_autostart', async () => {
    const appName = 'PrimusClient';
    return new Promise((resolve, reject) => {
        exec(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${appName}" /f`, (error) => {
            // Ignore errors (key might not exist)
            resolve('Autostart disabled');
        });
    });
});

// Check backend connection
ipcMain.handle('check_backend_connection', async (event, url) => {
    try {
        const response = await fetch(`${url}/health`);
        return response.ok;
    } catch {
        return false;
    }
});

// Register PC with backend (placeholder - actual implementation in renderer)
ipcMain.handle('register_pc_with_backend', async () => {
    return 'Registration handled by renderer';
});

// Setup complete kiosk (placeholder)
ipcMain.handle('setup_complete_kiosk', async () => {
    return 'Kiosk setup handled by enable_kiosk_shortcuts';
});

// Cleanup closed apps (placeholder)
ipcMain.handle('cleanup_closed_apps', async () => {
    return 'No apps to cleanup';
});

// Manage window focus (placeholder)
ipcMain.handle('manage_window_focus', async () => {
    if (mainWindow && kioskModeActive) {
        mainWindow.focus();
    }
    return 'Window focus managed';
});

// Launch game/app
ipcMain.handle('launch_game', async (event, exePath) => {
    return new Promise((resolve, reject) => {
        exec(`"${exePath}"`, (error) => {
            if (error) {
                reject(`Failed to launch: ${error.message}`);
            } else {
                resolve(`Launched: ${exePath}`);
            }
        });
    });
});

// Browse for game (file dialog)
ipcMain.handle('browse_for_game', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Game Executable',
        filters: [
            { name: 'Executables', extensions: ['exe'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        throw new Error('No file selected');
    }
    return result.filePaths[0];
});

// Detect installed games (simplified)
ipcMain.handle('detect_installed_games', async () => {
    const games = [];
    const steamPaths = [
        'C:\\Program Files (x86)\\Steam\\steam.exe',
        'C:\\Program Files\\Steam\\steam.exe'
    ];

    for (const p of steamPaths) {
        if (fs.existsSync(p)) {
            games.push({
                name: '🎮 Steam',
                exe_path: p,
                install_path: p,
                icon_path: null,
                is_running: false
            });
            break;
        }
    }

    return games;
});

// App lifecycle
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

