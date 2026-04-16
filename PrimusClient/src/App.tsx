import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSystemStore } from './stores/systemStore';
import { invoke } from "@tauri-apps/api/tauri";
import { commandService } from './services/commandService';

import LoginScreen from './components/screens/LoginScreen';
import SessionScreen from './components/screens/SessionScreen';
import AdminPortal from './components/screens/AdminPortal';
import StaffPortal from './components/screens/StaffPortal';
import LoadingScreen from './components/screens/LoadingScreen';
import SetupScreen from './components/screens/SetupScreen';
import ErrorBoundary from './components/common/ErrorBoundary';
import SystemNotifications from './components/common/SystemNotifications';
import KioskControls from './components/common/KioskControls';
import LockOverlay from './components/common/LockOverlay';


function App() {
  const { user, isLoading: authLoading, initialize: initializeAuth } = useAuthStore();
  const { isConnected, needsHandshake } = useSystemStore();
  const [appState, setAppState] = useState<'loading' | 'setup-required' | 'ready'>('loading');

  useEffect(() => {
    const checkSetup = async () => {
      try {
        console.log('[Primus] Checking device credentials...');
        const creds = await invoke<any>("get_device_credentials");
        console.log('[Primus] Device credentials response:', creds);

        if (creds && creds.pc_id) {
          console.log("[Primus] Device registered, starting command service...");
          const started = await commandService.start();

          if (started) {
            setAppState('ready');
            // Only initialize auth AFTER device setup is confirmed
            initializeAuth();
          } else {
            // If start() returned false, it means credentials failed validation
            // commandService will trigger onNeedHandshake, which sets needsHandshake=true
            // We can let that reactive flow handle it, or force it here.
            // The reactive flow in renderMainContent will pick it up.
            setAppState('ready'); // Temporarily ready, will switch to setup if needsHandshake=true
          }
        } else {
          console.log('[Primus] No device credentials found - showing SetupScreen');
          setAppState('setup-required');
          // Don't call initializeAuth here - device needs to be set up first
        }
      } catch (e) {
        console.error("[Primus] Failed to check device credentials", e);
        setAppState('setup-required');
        // Don't call initializeAuth here - device needs to be set up first
      }
    };

    checkSetup();
    // Removed: initializeAuth() - now called only after device setup is confirmed
  }, [initializeAuth]);

  const renderMainContent = () => {
    // CRITICAL: Check device setup FIRST, before anything else
    // If device is not registered OR re-handshake is needed, we MUST show SetupScreen
    if (appState === 'setup-required' || needsHandshake) {
      console.log('[Primus] Rendering SetupScreen (setup-required or needsHandshake)');
      return <SetupScreen onComplete={() => {
        setAppState('ready');
        // Initialize auth after device setup to show LoginScreen
        initializeAuth();
      }} />;
    }

    // Show loading only if we're still checking device credentials
    if (appState === 'loading' || authLoading) {
      console.log('[Primus] Rendering LoadingScreen', { appState, authLoading });
      return <LoadingScreen message="Initializing Primus..." />;
    }

    // Device is registered, now check user authentication
    if (!user) {
      console.log('[Primus] Rendering LoginScreen (no user authenticated)');
      return <LoginScreen />;
    }

    // Route based on user role
    switch (user.role) {
      case 'admin':
        return (
          <Routes>
            <Route path="/" element={<AdminPortal />} />
            <Route path="/session" element={<SessionScreen />} />
            <Route path="*" element={<AdminPortal />} />
          </Routes>
        );

      case 'staff':
        return (
          <Routes>
            <Route path="/" element={<StaffPortal />} />
            <Route path="/session" element={<SessionScreen />} />
            <Route path="*" element={<StaffPortal />} />
          </Routes>
        );

      case 'client':
      default:
        return (
          <Routes>
            <Route path="/" element={<SessionScreen />} />
            <Route path="*" element={<SessionScreen />} />
          </Routes>
        );
    }
  };

  return (
    <ErrorBoundary>
      <div className="app kiosk-mode">
        {/* Lock overlay (blocks all interaction when PC is locked) */}
        <LockOverlay />

        {/* Connection status indicator (Only if setup is done) */}
        {appState === 'ready' && !isConnected && (
          <div className="fixed top-0 left-0 right-0 bg-warning-600 text-white text-center py-2 text-sm font-medium z-[9998]">
            ⚠️ Offline Mode - Limited functionality available
          </div>
        )}

        {/* Main application content */}
        <main className={`h-screen overflow-hidden ${appState === 'ready' && !isConnected ? 'pt-8' : ''}`}>
          {renderMainContent()}
        </main>

        {/* System notifications */}
        <SystemNotifications />

        {/* Kiosk Controls - Small floating panel */}
        {user?.role === 'admin' && <KioskControls />}
      </div>
    </ErrorBoundary>
  );
}

export default App;
