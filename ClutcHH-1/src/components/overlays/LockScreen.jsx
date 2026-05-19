/**
 * Full-screen lock overlay rendered when the backend sends a `lock` command.
 * Shown above every route and every interactive element; nothing in the
 * NoLag UI is reachable until the admin issues `unlock`.
 *
 * We block pointer + keyboard events at the overlay level; the native
 * KioskOrchestrator still has the low-level keyboard hook running so
 * Win-key / Alt-F4 / Ctrl-Esc are filtered out regardless.
 */
export default function LockScreen({ message }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Station locked"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background:
          'radial-gradient(circle at 50% 30%, rgba(59,130,246,0.18), rgba(10,12,20,0.98) 65%)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
      onMouseDownCapture={(e) => e.stopPropagation()}
      onKeyDownCapture={(e) => e.preventDefault()}
    >
      <div style={{ textAlign: 'center', maxWidth: 560, padding: 32 }}>
        <div
          aria-hidden="true"
          style={{
            width: 96,
            height: 96,
            margin: '0 auto 20px',
            borderRadius: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #3ABEFF, #8B5CF6)',
            boxShadow: '0 20px 60px rgba(58,190,255,0.35)',
            fontSize: 48,
          }}
        >
          🔒
        </div>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}
        >
          Station locked
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'rgba(229,231,235,0.85)',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {message ||
            'An administrator has locked this station. Please wait — it will unlock automatically.'}
        </p>
        <div
          style={{
            marginTop: 28,
            fontSize: 11,
            letterSpacing: '0.24em',
            color: 'rgba(156,163,175,0.8)',
            textTransform: 'uppercase',
          }}
        >
          NoLag · Primus Kiosk
        </div>
      </div>
    </div>
  );
}
