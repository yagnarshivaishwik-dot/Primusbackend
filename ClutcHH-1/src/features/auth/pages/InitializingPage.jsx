import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';

export default function InitializingPage() {
  return <Navigate to={ROUTES.login} replace />;
}
