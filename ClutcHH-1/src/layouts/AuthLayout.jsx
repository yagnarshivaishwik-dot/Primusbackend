import { Navigate, Outlet } from 'react-router-dom';
import useSessionStore from '@/app/store/useSessionStore';
import { ROUTES } from '@/app/routes/paths';

export default function AuthLayout() {
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to={ROUTES.home} replace />;
  }
  return (
    <div style={{ minHeight: '100vh', background: '#0B0C10' }}>
      <Outlet />
    </div>
  );
}
