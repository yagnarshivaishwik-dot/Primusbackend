/**
 * PackagePaywallBanner — Phase 1 of the paywall trio.
 *
 * Sticky, non-dismissible banner pinned to the top of the Shop page
 * whenever the signed-in customer has no active time package. The
 * banner copy is unambiguous so customers know exactly what to do
 * (buy a pack from this very page).
 *
 * Renders nothing on its own — it's strictly visual. PackageGuard
 * decides when it's shown.
 */

export default function PackagePaywallBanner() {
  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5000,
        background:
          'linear-gradient(90deg, rgba(245,158,11,0.95), rgba(220,38,38,0.95))',
        color: '#fff',
        padding: '14px 24px',
        textAlign: 'center',
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: 0.3,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(2px)',
      }}
    >
      ⏳ Please purchase a time package to continue — your kiosk is
      locked until you buy a pack below.
    </div>
  );
}
