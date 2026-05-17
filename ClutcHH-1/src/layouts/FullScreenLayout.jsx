import { Navigate, Outlet, useLocation } from 'react-router-dom';
import BottomNav from '@/components/layout/BottomNav';
import OverlayRoot from '@/components/overlays/OverlayRoot';
import useSessionStore from '@/app/store/useSessionStore';
import { ROUTES } from '@/app/routes/paths';

/**
 * FullScreenLayout — authenticated routes where the page itself owns its
 * top chrome (Pavan's shop "cartheader", Guna's NeoG Dashboard internal
 * UI). The shared ClutcHH-1 Navbar is NOT rendered here — instead, a
 * floating glassy `BottomNav` provides cross-page navigation.
 *
 * Used by: /home, /shop  (see app/routes/AppRoutes.jsx)
 */
export default function FullScreenLayout() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }

  // Home page locks viewport (no scrolling — design is meant to fit screen).
  // Other full-screen pages (shop) can still scroll.
  //
  // IMPORTANT for sticky: on scrollable pages, use `overflow: visible` so the
  // document body remains the scroll container. If this wrapper has
  // `overflow: auto`, it becomes the nearest scroll-container ancestor for any
  // `position: sticky` descendant — but since its own height is `auto`, it
  // never actually scrolls and the sticky element just rides up with the page.
  const isHome = location.pathname === ROUTES.home;
  return (
    <div
      className="app-shell"
      style={{
        minHeight: '100vh',
        height: isHome ? '100vh' : 'auto',
        overflow: isHome ? 'hidden' : 'visible',
        paddingBottom: isHome ? 0 : '160px',
      }}
    >
      <Outlet />
      <BottomNav />
      <OverlayRoot />
    </div>
  );
}
