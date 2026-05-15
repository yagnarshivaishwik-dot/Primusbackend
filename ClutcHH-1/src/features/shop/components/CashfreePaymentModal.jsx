import { useEffect, useRef, useState } from 'react';
import { createOrder, getOrderStatus } from '../services/cashfreeService';
import { invoke, listen as listenBridge, hasBridge } from '@/app/bridge/invoke';
import { audit } from '@/app/api/audit';

/**
 * Cashfree fullscreen payment overlay.
 *
 * Architecture (Phase 4 — Inventory v2):
 *   1. We call /api/v1/payment/cashfree/create-order to get an order
 *      with `payment_link` set to Cashfree's hosted-checkout URL on
 *      payments.cashfree.com.
 *   2. We invoke the C# bridge's `payment_open` command, which opens a
 *      borderless / topmost / maximised child WebView2 navigated DIRECTLY
 *      to that URL. The kiosk's main React app stays mounted underneath
 *      (state preserved); the user just sees Cashfree's own page on top.
 *   3. The child WebView2 intercepts Cashfree's redirect to our return
 *      URL, closes itself, and posts a `payment_completed` event back
 *      via the bridge — that's our success/cancel signal.
 *   4. The webhook on the backend has already credited the user's
 *      UserOffer by then (signed, replay-protected, idempotent).
 *
 * Why this design:
 *   The Cashfree JS SDK iframe checks parent origin against a merchant
 *   allowed-origins list and rejects virtual hosts like
 *   kiosk.primustech.in. By navigating to Cashfree's hosted page in a
 *   second WebView2, the page's origin becomes payments.cashfree.com —
 *   Cashfree's own origin — and there's nothing to whitelist.
 *
 * Fallback signals (defence in depth):
 *   - 3-second poll of GET /order/{id} — covers a payment that succeeded
 *     in Cashfree but the bridge event got lost.
 *   - WebSocket `payment_confirmed` event from the backend webhook —
 *     same payload as the legacy modal listened for.
 *   - 10-minute timeout — flips to a friendly "took too long" screen.
 *
 * Outside-kiosk fallback:
 *   When `hasBridge()` is false (e.g. running in `vite dev` outside the
 *   kiosk app), we fall back to navigating window.location.href to the
 *   payment_link directly, which still works because Cashfree's hosted
 *   page accepts any browser. The realtime+poll signals still close the
 *   modal on success.
 */
export default function CashfreePaymentModal({
  amount,
  pcId,
  packId,
  note,
  onSuccess,
  onClose,
}) {
  const [phase, setPhase] = useState('creating'); // creating | awaiting | paid | error | timeout
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const checkoutOpenedRef = useRef(false);

  // 1. Create the order via the backend.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await createOrder({ amount, pcId, packId, note });
        if (cancelled) return;
        if (!o.payment_link) {
          // Backwards-compat: older backends still return only
          // payment_session_id without payment_link.
          setError('Payment provider did not return a checkout URL. Try again.');
          setPhase('error');
          return;
        }
        setOrder(o);
        setPhase('awaiting');
        audit('payment.cashfree.session_created', {
          order_id: o.order_id,
          env: o.environment,
          amount,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not start payment.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, pcId, packId, note]);

  // 2. Once we have the link, open the C# child WebView (or full-page
  //    redirect when the bridge is absent).
  useEffect(() => {
    if (phase !== 'awaiting' || !order?.payment_link) return undefined;
    if (checkoutOpenedRef.current) return undefined;
    checkoutOpenedRef.current = true;

    if (!hasBridge()) {
      // Outside kiosk (dev / browser preview) — full-page redirect.
      audit('payment.cashfree.fallback_redirect', {
        order_id: order.order_id,
      });
      window.location.href = order.payment_link;
      return undefined;
    }

    invoke('payment_open', {
      payment_link: order.payment_link,
      order_id: order.order_id,
    }).catch((err) => {
      audit('payment.cashfree.bridge_error', {
        order_id: order.order_id,
        message: err?.message,
      });
      setError(err?.message || 'Could not launch payment terminal.');
      setPhase('error');
    });

    return undefined;
  }, [phase, order]);

  // 3. Listen for the bridge's payment_completed event (fired when the
  //    child WebView intercepts Cashfree's return URL).
  useEffect(() => {
    if (phase !== 'awaiting' || !order?.order_id) return undefined;
    let unlisten = null;
    let cancelled = false;
    (async () => {
      try {
        const off = await listenBridge('payment_completed', (ev) => {
          const p = ev?.payload;
          if (!p) return;
          if (p.order_id && p.order_id !== order.order_id) return;
          const status = (p.status || '').toUpperCase();
          if (status === 'PAID') {
            setPhase('paid');
            audit('payment.cashfree.success', {
              order_id: order.order_id,
              via: 'bridge',
            });
            return;
          }
          if (status === 'CANCELLED') {
            setError('Payment was cancelled.');
            setPhase('error');
            audit('payment.cashfree.cancelled', { order_id: order.order_id });
            return;
          }
          if (status === 'FAILED') {
            setError(p.error || 'Payment failed.');
            setPhase('error');
            audit('payment.cashfree.failed', {
              order_id: order.order_id,
              error: p.error,
            });
            return;
          }
          // UNKNOWN — fall through to poll/realtime to confirm.
        });
        if (!cancelled) unlisten = off;
      } catch {
        /* bridge unavailable — polling still covers us */
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') {
        try {
          unlisten();
        } catch {
          /* ignore */
        }
      }
    };
  }, [phase, order?.order_id]);

  // 4. Listen for the backend's webhook-driven payment_confirmed event
  //    on the existing realtime channel.
  useEffect(() => {
    if (phase !== 'awaiting' || !order?.order_id) return undefined;
    let unlisten = null;
    let cancelled = false;
    (async () => {
      try {
        const off = await listenBridge('payment_confirmed', (ev) => {
          const p = ev?.payload;
          if (!p) return;
          if (p.order_id && p.order_id !== order.order_id) return;
          if ((p.status || '').toUpperCase() === 'PAID' || p.amount > 0) {
            setPhase('paid');
            audit('payment.cashfree.success', {
              order_id: order.order_id,
              via: 'webhook',
            });
          }
        });
        if (!cancelled) unlisten = off;
      } catch {
        /* bridge unavailable; polling covers us */
      }
    })();
    return () => {
      cancelled = true;
      if (typeof unlisten === 'function') {
        try {
          unlisten();
        } catch {
          /* ignore */
        }
      }
    };
  }, [phase, order?.order_id]);

  // 5. Polling fallback + elapsed clock + 10-minute timeout.
  useEffect(() => {
    if (phase !== 'awaiting' || !order?.order_id) return undefined;

    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    const poll = async () => {
      try {
        const s = await getOrderStatus(order.order_id);
        if (s?.paid) {
          setPhase('paid');
          audit('payment.cashfree.success', {
            order_id: order.order_id,
            via: 'poll',
          });
        }
      } catch {
        /* transient — keep polling */
      }
    };
    poll();
    pollRef.current = window.setInterval(poll, 3000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      pollRef.current = null;
      timerRef.current = null;
    };
  }, [phase, order?.order_id]);

  // 6. onSuccess firing.
  useEffect(() => {
    if (phase === 'paid') {
      const t = window.setTimeout(() => onSuccess?.(order), 1200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, onSuccess, order]);

  // 7. 10-minute timeout cap.
  useEffect(() => {
    if (phase !== 'awaiting') return undefined;
    if (elapsed >= 600) {
      setPhase('timeout');
      audit('payment.cashfree.timeout', { order_id: order?.order_id });
    }
    return undefined;
  }, [elapsed, phase, order?.order_id]);

  // 8. If user clicks Cancel while awaiting, ask the host to close the
  //    child WebView too.
  const handleCancel = () => {
    if (hasBridge()) {
      invoke('payment_close', {}).catch(() => {
        /* host might already be gone; UI close is what matters */
      });
    }
    onClose?.();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  // Fullscreen overlay (Option A): the kiosk WebView is already a
  // locked-down browser, so a full-viewport React overlay IS the
  // "locked terminal" experience for the host page.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Secure Payment"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background:
          'radial-gradient(120% 120% at 50% 0%, #15203a 0%, #0a0d14 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(640px, 100%)',
          textAlign: 'center',
        }}
      >
        {/* Header */}
        <div
          style={{
            fontSize: 12,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#6B7280',
            marginBottom: 12,
          }}
        >
          Secure Payment Terminal
        </div>

        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            marginBottom: 4,
            letterSpacing: -1,
          }}
        >
          ₹ {Number(amount).toLocaleString('en-IN')}
        </div>

        {phase === 'creating' && (
          <div style={{ padding: '40px 0' }}>
            <Spinner />
            <div style={{ marginTop: 18, color: '#9CA3AF', fontSize: 14 }}>
              Creating secure Cashfree order…
            </div>
          </div>
        )}

        {phase === 'awaiting' && order && (
          <div style={{ padding: '20px 0' }}>
            <div
              style={{
                color: '#E5E7EB',
                fontSize: 16,
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Complete payment in the secure window
            </div>
            <div
              style={{
                color: '#9CA3AF',
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              Choose UPI / card / netbanking · Order #{order.order_id}
            </div>
            <Spinner subtle />
            <div
              style={{
                marginTop: 22,
                color: '#3ABEFF',
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Waiting for payment · {mm}:{ss}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                marginTop: 28,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#9CA3AF',
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel and return to kiosk
            </button>
          </div>
        )}

        {phase === 'paid' && (
          <div style={{ padding: '40px 0' }}>
            <div style={{ fontSize: 84, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              Payment received
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 14, marginTop: 6 }}>
              Your time has been added. Returning to kiosk…
            </div>
          </div>
        )}

        {(phase === 'error' || phase === 'timeout') && (
          <div style={{ padding: '30px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
              {phase === 'timeout' ? 'Payment timed out' : 'Payment did not complete'}
            </div>
            <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 22 }}>
              {error || 'Cashfree did not confirm the payment. You can close this and try again.'}
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#E8364F',
                border: 'none',
                color: '#fff',
                padding: '12px 26px',
                borderRadius: 10,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes cf-spin { to { transform: rotate(360deg); } }
        @keyframes cf-pulse { 0%, 100% { opacity: 0.6 } 50% { opacity: 1 } }
      `}</style>
    </div>
  );
}

function Spinner({ subtle = false }) {
  const size = subtle ? 36 : 56;
  return (
    <div
      style={{
        width: size,
        height: size,
        margin: '0 auto',
        border: `${subtle ? 3 : 5}px solid #3ABEFF`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'cf-spin 0.8s linear infinite',
        opacity: subtle ? 0.7 : 1,
      }}
    />
  );
}
