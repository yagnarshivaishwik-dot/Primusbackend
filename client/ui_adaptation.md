## Primus UI Adaptation for Windows Kiosk (WPF)

**Source of truth**: `PrimusClient/src` React/Tailwind/Tauri application.

### Mapping Decisions

- **Tech stack**: Chosen **WPF on .NET 8** because:
  - It provides fine‑grained layout control (Grid/StackPanel) which maps well to Tailwind-based Flexbox layouts.
  - Works well with a single-file, self-contained EXE and kiosk-style full-screen windows.
- **Fonts and branding**:
  - The large `PRIMUS` heading and neon style from `login-and-register.jsx` and `LoginScreen.tsx` are approximated using:
    - `FontWeight="Black"` and light text on dark gradients.
    - Gradient background from `from-slate-900 to-blue-900` approximated with `BackgroundGradientStart=#020617` and `BackgroundGradientEnd=#0B1120`.
- **Login screen**:
  - `LoginView.xaml` follows the same structure as `LoginScreen.tsx`:
    - Centered card with rounded corners, gradient background, and two primary fields (email/username + password).
    - Primary action button text and busy state mirror `"Sign In" / "Signing In..."`.
  - Validation messages are shown below fields, similar to Zod + `react-hook-form` error display.
- **Session screen**:
  - `SessionView.xaml` mirrors `SessionScreen.tsx`:
    - Left sidebar with session timer, status text, start/end buttons, and wallet summary.
    - Right panel with "Available Games" header and a responsive grid of game cards.
    - Offline indicator is shown via `ConnectionStatusText`/brush instead of the React top banner.

### Behavioural Parity

- **Heartbeat**: The React app uses `useSystemStore().sendHeartbeat()` every 30 seconds; the WPF client centralizes this into `RealtimeClient` + `OfflineQueueService` and will send heartbeats and queued events when online.
- **Commands and lock screen**:
  - The floating `KioskControls.tsx` admin-only controls are conceptually represented via admin commands handled by `CommandHandler`:
    - `lock_screen` shows the `LockOverlay` in `MainWindow.xaml`.
    - `unlock` hides the overlay.
- **Session timer**:
  - The React timer in `SessionScreen.tsx` is reimplemented in `SessionViewModel` as a background loop deriving elapsed time from `CurrentSessionStartUtc`.

### Known Visual Differences

- **Exact Tailwind spacings and shadows**:
  - WPF uses approximate margins and drop shadows; spacing is within a few pixels of the React version but not mathematically identical.
- **SVG icons and Lucide-react icons**:
  - Lucide icons (e.g., `Gamepad2`, `Wallet`) are approximated via simple layout and text placeholders; full vector parity would require importing SVGs or an icon font.
- **Google / social login widgets**:
  - The React implementation relies on Google Identity Services and QR codes; the kiosk app is focused on username/password plus OIDC provisioning and does not embed Google buttons.

### Licensing Notes

- The existing Primus client uses:
  - **lucide-react** icons and Tailwind CSS, which are open-source (MIT licenses).
  - Google Fonts (`Orbitron`) via CDN.
- The kiosk WPF app does not embed third-party fonts or icon packs directly; it only mimics the appearance with standard system fonts and colors, avoiding redistribution of third-party assets.


