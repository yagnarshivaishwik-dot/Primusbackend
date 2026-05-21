/**
 * PackageGuard — Phase 1 of the paywall trio.
 *
 * Wraps every signed-in route. Behaviour:
 *
 *   - hasActivePackage === null  → still loading; render children
 *     optimistically (no flash of paywall on every refresh for users
 *     who DO have a package).
 *   - hasActivePackage === true  → render children, no banner.
 *   - hasActivePackage === false + on /main/shop → render Shop with
 *     the persistent non-dismissible PackagePaywallBanner pinned on top.
 *   - hasActivePackage === false + NOT on /main/shop → redirect to
 *     /main/shop (replace, so back-button can't get past the gate).
 *
 * When the flag transitions false → true (cash/UPI credit just landed),
 * auto-navigate to Home so the customer sees their full kiosk again.
 *
 * A 30 s background poll catches any window where the WS time_updated
 * event was missed (reconnect mid-flight, network blip).
 */

import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

import useWalletStore from '@/app/store/useWalletStore';
import { ROUTES } from '@/app/routes/paths';

import PackagePaywallBanner from '@/components/banners/PackagePaywallBanner';
import PackageCountdownPill from '@/components/timer/PackageCountdownPill';

export default function PackageGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const hasActivePackage = useWalletStore((s) => s.hasActivePackage);
  const refreshActivePackage = useWalletStore((s) => s.refreshActivePackage);

  // Transition detector: false → true means a package just got credited.
  // Bounce to Home so the customer doesn't sit on Shop staring at a
  // banner that no longer applies.
  const prevHasActiveRef = useRef(hasActivePackage);
  useEffect(() => {
    const prev = prevHasActiveRef.current;
    if (prev === false && hasActivePackage === true) {
      navigate(ROUTES.home, { replace: true });
    }
    prevHasActiveRef.current = hasActivePackage;
  }, [hasActivePackage, navigate]);

  // Fire one immediate refresh on mount so the gate kicks in within ~200ms
  // of the user landing on any signed-in route — without this the guard
  // had to wait for the first 30 s poll cycle (or an external hydrate
  // call) before flipping hasActivePackage off `null`. That meant a
  // zero-minute user could see Home for up to 30 seconds before being
  // bounced to Shop. Run-once via the empty-ish dep array; the polling
  // effect below handles ongoing reconciliation.
  useEffect(() => {
    refreshActivePackage?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt-and-suspenders 30 s poll fallback. The WS time_updated push is
  // the primary signal; this catches the rare case where the WS
  // reconnected and missed an event in-flight.
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshActivePackage?.();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refreshActivePackage]);

  if (hasActivePackage === null) {
    return <Outlet />;
  }
  if (hasActivePackage === true) {
    // Active package → render route content + the always-visible
    // countdown pill (Phase 2). Pill renders nothing when no time is
    // left so it auto-hides during the brief window between zero and
    // the redirect kicking in.
    return (
      <>
        <PackageCountdownPill />
        <Outlet />
      </>
    );
  }
  if (location.pathname !== ROUTES.mainShop) {
    return <Navigate to={ROUTES.mainShop} replace />;
  }
  return (
    <>
      <PackagePaywallBanner />
      <Outlet />
    </>
  );
}
