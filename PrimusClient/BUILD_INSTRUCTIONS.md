# Primus Kiosk App - Build Instructions

## Prerequisites

1. **Node.js** (version 16 or higher)
2. **Rust** (latest stable version)
3. **Tauri CLI** (will be installed with npm dependencies)

## Build Process

### 1. Install Dependencies
```bash
cd PrimusClient
npm install
```

### 2. Configure Backend URL
Edit `src/config/api.js` and replace `<MY_BACKEND_SERVER_IP>` with your actual backend server IP:
```javascript
const API_URL = "http://192.168.1.100:8000";  // Replace with your IP
```

### 3. Build the Application
```bash
npm run build
npm run tauri build
```

## Build Output

The final executable will be located at:
```
PrimusClient/src-tauri/target/release/Primus.exe
```

Additional build artifacts:
- **Bundle**: `PrimusClient/src-tauri/target/release/bundle/`
- **MSI Installer**: `PrimusClient/src-tauri/target/release/bundle/msi/Primus_1.0.0_x64_en-US.msi`
- **NSIS Installer**: `PrimusClient/src-tauri/target/release/bundle/nsis/Primus_1.0.0_x64-setup.exe`

## Kiosk Mode Configuration

The app is pre-configured for kiosk mode with:
- ✅ Fullscreen display
- ✅ No window decorations
- ✅ Always on top
- ✅ Non-resizable
- ✅ Direct API connection to backend server

## Windows Shell Replacement

### Apply Kiosk Mode
1. Edit `windows-shell-replacement.reg`
2. Replace `C:\\Path\\To\\Primus.exe` with the actual path to your built executable
3. Run the .reg file as Administrator
4. Restart the computer

### Restore Normal Mode
1. Run `restore-explorer-shell.reg` as Administrator
2. Restart the computer

## Troubleshooting

### Build Issues
- Ensure Rust is installed: `rustc --version`
- Update Tauri CLI: `npm install -g @tauri-apps/cli@latest`
- Clear cache: `npm run build && rm -rf dist/`

### Runtime Issues
- Verify backend server is running on the configured IP:port
- Check Windows Firewall settings
- Ensure API_URL in `src/config/api.js` matches your backend server

## Security Notes

- The app allows HTTP requests only to the configured backend server
- WebSocket connections are restricted to the same backend server
- File system access is limited to app-specific directories
