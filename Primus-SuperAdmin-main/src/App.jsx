import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore, { PERMISSIONS } from './stores/authStore';
import useThemeStore from './stores/themeStore';

// Layout
import MainLayout from './components/Layout/MainLayout';
import ProtectedRoute from './components/Auth/ProtectedRoute';

// Pages
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import CafeRegistry from './pages/CafeRegistry';
import CafeDetail from './pages/CafeDetail';
import CafeEdit from './pages/CafeEdit';
import Subscriptions from './pages/Subscriptions';
import Analytics from './pages/Analytics';
import SystemHealth from './pages/SystemHealth';
import UserManagement from './pages/UserManagement';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

function App() {
  const { restoreSession } = useAuthStore();
  const { initializeTheme } = useThemeStore();

  useEffect(() => {
    restoreSession();
    initializeTheme();
  }, [restoreSession, initializeTheme]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Protected routes with layout */}
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          {/* Dashboard */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Café routes */}
          <Route
            path="/cafes"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_CAFE_REGISTRY}>
                <CafeRegistry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cafes/:id"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_CAFE_REGISTRY}>
                <CafeDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cafes/:id/edit"
            element={
              <ProtectedRoute permission={PERMISSIONS.EDIT_CAFE_DETAILS}>
                <CafeEdit />
              </ProtectedRoute>
            }
          />

          {/* Subscriptions */}
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_SUBSCRIPTIONS}>
                <Subscriptions />
              </ProtectedRoute>
            }
          />

          {/* Analytics */}
          <Route
            path="/analytics"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_FINANCIAL_ANALYTICS}>
                <Analytics />
              </ProtectedRoute>
            }
          />

          {/* System Health */}
          <Route
            path="/system-health"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_PC_HEALTH}>
                <SystemHealth />
              </ProtectedRoute>
            }
          />

          {/* User Management */}
          <Route
            path="/users"
            element={
              <ProtectedRoute permission={PERMISSIONS.MANAGE_USERS}>
                <UserManagement />
              </ProtectedRoute>
            }
          />

          {/* Audit Logs */}
          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute permission={PERMISSIONS.VIEW_AUDIT_LOGS}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />

          {/* Settings */}
          <Route path="/settings" element={<Settings />} />
        </Route>

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* 404 */}
        <Route
          path="*"
          element={
            <div className="not-found">
              <h1>404</h1>
              <p>Page not found</p>
              <a href="/dashboard" className="btn btn--secondary">
                Back to Dashboard
              </a>
              <style>{`
                .not-found {
                  min-height: 100vh;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                  gap: var(--space-md);
                  background: var(--bg-page);
                }
                .not-found h1 {
                  font-size: 6rem;
                  font-weight: 700;
                  color: var(--text-primary);
                }
                .not-found p {
                  color: var(--text-tertiary);
                  font-size: var(--text-lg);
                }
              `}</style>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
