/**
 * PackageCountdownPill — Phase 2 of the paywall trio.
 *
 * Pinned in the top-right corner of every signed-in route. Renders:
 *   1. A compact countdown pill ("⏱ 1h 23m") showing minutesLeft.
 *   2. A non-dismissible reminder toast at 15/10/5/1 minutes remaining
 *      so the customer can wrap up before getting kicked out.
 *
 * Drives the local minute-tick (walletStore.tickDown every 60 s).
 * Server reconciles via the WS time_updated event + /active-package
 * poll fallback in PackageGuard. When minutesLeft hits 0 we navigate
 * to /main/shop — PackageGuard's redirect machinery then keeps the
 * customer locked there until they buy a new pack.
 *
 * The C# host paints its own topmost reminder overlay over running
 * games (because they live outside WebView2). This component only
 * covers the in-kiosk case.
 *
 * Returns null when there's no active package — the paywall banner
 * + Shop-only redirect handle that state.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import useWalletStore from '@/app/store/useWalletStore';
import { ROUTES } from '@/app/routes/paths';

const REFRESH_ON_ZERO_DELAY_MS = 250;

const REMINDER_MINUTES = [15, 10, 5, 1];

function formatRemaining(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function PackageCountdownPill() {
  const navigate = useNavigate();
  const minutesLeft = useWalletStore((s) => s.minutesLeft);
  const hasActivePackage = useWalletStore((s) => s.hasActivePackage);
  const tickDown = useWalletStore((s) => s.tickDown);
  const refreshActivePackage = useWalletStore((s) => s.refreshActivePackage);

  // Local 1-minute tick. Server pushes the authoritative value on every
  // time_updated WS event, so drift stays bounded to under 60 s.
  useEffect(() => {
    if (hasActivePackage !== true) return undefined;
    const id = window.setInterval(() => tickDown?.(), 60_000);
    return () => window.clearInterval(id);
  }, [hasActivePackage, tickDown]);

  // Threshold reminder. Track the LAST threshold we already showed so we
  // never re-fire when a refill bumps minutesLeft back above the line.
  const lastFiredRef = useRef(null);
  const [reminderText, setReminderText] = useState(null);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    if (hasActivePackage !== true) {
      lastFiredRef.current = null;
      setReminderText(null);
      return;
    }
    // Fire exactly when minutesLeft EQUALS a threshold (not <=) so a
    // single tick can only trigger one reminder. The dedupe ref blocks
    // a re-fire if the user purchases more time and ticks back through.
    const hit = REMINDER_MINUTES.find((m) => m === minutesLeft);
    if (hit != null && lastFiredRef.current !== hit) {
      lastFiredRef.current = hit;
      setReminderText(`Only ${hit} minute${hit === 1 ? '' : 's'} left — wrap up or buy another pack.`);
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = window.setTimeout(() => setReminderText(null), 9000);
    }
  }, [minutesLeft, hasActivePackage]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    },
    [],
  );

  // Hit zero → bounce to Shop AND force an immediate refresh so the
  // hasActivePackage flag flips false right away. Without the explicit
  // refresh the kiosk's cached `true` value lingers until the next 30 s
  // poll cycle, which means the customer briefly sees Shop without the
  // banner (the gate visually under-reacts to the timer). The small
  // delay gives the navigate() a tick to settle before we hit the API.
  useEffect(() => {
    if (hasActivePackage === true && minutesLeft === 0) {
      navigate(ROUTES.mainShop, { replace: true });
      const t = window.setTimeout(() => {
        refreshActivePackage?.();
      }, REFRESH_ON_ZERO_DELAY_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [minutesLeft, hasActivePackage, navigate, refreshActivePackage]);

  if (hasActivePackage !== true) return null;

  return (
    <>
      <div
        aria-label="time remaining"
        style={{
          position: 'fixed',
          // Sit below the AppHeader bar so the avatar / settings dropdowns
          // (which open downward from the header) render on top of us
          // instead of behind us. Otherwise customers couldn't see the
          // Log out menu while paywalled — it was hidden under the pill.
          top: 76,
          right: 18,
          // Above page content, below header dropdowns (typical z-index
          // 1000-2000 in the codebase).
          zIndex: 800,
          background:
            'linear-gradient(135deg, rgba(20,26,46,0.9), rgba(13,18,36,0.9))',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 999,
          padding: '8px 16px',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.3,
          boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 13 }}>⏱</span>
        <span>{formatRemaining(minutesLeft)}</span>
      </div>

      {reminderText && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            position: 'fixed',
            // Pushed further down so the pill and the toast don't
            // overlap each other or the AppHeader dropdowns.
            top: 128,
            right: 18,
            maxWidth: 360,
            zIndex: 810,
            background:
              'linear-gradient(135deg, rgba(245,158,11,0.95), rgba(220,38,38,0.95))',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            animation: 'fadeIn 220ms ease-out',
          }}
        >
          {reminderText}
        </div>
      )}
    </>
  );
}
