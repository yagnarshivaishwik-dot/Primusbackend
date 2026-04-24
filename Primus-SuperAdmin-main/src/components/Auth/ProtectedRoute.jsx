import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import useAuthStore from '../../stores/authStore';

/**
 * ProtectedRoute - Wraps routes that require authentication and/or specific permissions
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render if authorized
 * @param {string|string[]} props.permission - Required permission(s) to access this route
 * @param {boolean} props.requireAll - If true, user must have ALL permissions. Default: any one
 */
export default function ProtectedRoute({
    children,
    permission = null,
    requireAll = false
}) {
    const location = useLocation();
    const {
        isAuthenticated,
        mustChangePassword,
        hasPermission,
        hasAllPermissions,
        hasAnyPermission,
        checkSessionTimeout,
        updateActivity
    } = useAuthStore();

    // Check session timeout on mount and route changes
    useEffect(() => {
        if (isAuthenticated) {
            checkSessionTimeout();
        }
    }, [location.pathname, isAuthenticated, checkSessionTimeout]);

    // Set up activity tracking on user interactions
    const handleUserActivity = useCallback(() => {
        updateActivity();
    }, [updateActivity]);

    useEffect(() => {
        if (!isAuthenticated) return;

        // Track activity on various user interactions
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

        events.forEach(event => {
            window.addEventListener(event, handleUserActivity, { passive: true });
        });

        // Also check for session timeout periodically (every 30 seconds)
        const intervalId = setInterval(() => {
            checkSessionTimeout();
        }, 30000);

        return () => {
            events.forEach(event => {
                window.removeEventListener(event, handleUserActivity);
            });
            clearInterval(intervalId);
        };
    }, [isAuthenticated, handleUserActivity, checkSessionTimeout]);

    // Not authenticated - redirect to login (preserving the intended destination)
    if (!isAuthenticated) {
        // Store the current path so we can redirect back after login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Must change password - redirect to password change page
    if (mustChangePassword && location.pathname !== '/change-password') {
        return <Navigate to="/change-password" replace />;
    }

    // Check permissions if required
    if (permission) {
        const permissions = Array.isArray(permission) ? permission : [permission];
        const hasAccess = requireAll
            ? hasAllPermissions(permissions)
            : hasAnyPermission(permissions);

        if (!hasAccess) {
            return <AccessDenied />;
        }
    }

    return children;
}

// Access Denied component
function AccessDenied() {
    return (
        <div className="access-denied">
            <div className="access-denied-content">
                <div className="access-denied-icon">🚫</div>
                <h1 className="access-denied-title">Access Denied</h1>
                <p className="access-denied-message">
                    You don't have permission to access this page.
                    Contact your administrator if you believe this is an error.
                </p>
                <a href="/dashboard" className="btn btn--secondary">
                    Return to Dashboard
                </a>
            </div>

            <style>{`
        .access-denied {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          padding: var(--space-xl);
        }

        .access-denied-content {
          text-align: center;
          max-width: 400px;
        }

        .access-denied-icon {
          font-size: 64px;
          margin-bottom: var(--space-lg);
        }

        .access-denied-title {
          font-size: var(--text-2xl);
          font-weight: 600;
          margin-bottom: var(--space-md);
          color: var(--status-danger);
        }

        .access-denied-message {
          color: var(--text-secondary);
          margin-bottom: var(--space-xl);
          line-height: 1.6;
        }
      `}</style>
        </div>
    );
}
