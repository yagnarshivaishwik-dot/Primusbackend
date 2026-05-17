import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import OverlayRoot from '@/components/overlays/OverlayRoot';
import useSessionStore from '@/app/store/useSessionStore';
import { ROUTES } from '@/app/routes/paths';

export default function MainLayout() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-shell">
      <Navbar />
      <Outlet />
      <OverlayRoot />
    </div>
  );
}
