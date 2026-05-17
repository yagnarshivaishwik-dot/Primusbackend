import { Navigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';

/**
 * Redemption now happens inline on the Prize Vault tiles — this standalone
 * route is deprecated. We redirect so old deep-links still land on a real
 * page instead of a dead-end confirmation screen.
 */
export default function PrizeRedeemPage() {
  return <Navigate to={ROUTES.mainPrizeVault} replace />;
}
