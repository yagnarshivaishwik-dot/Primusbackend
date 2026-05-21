// TEMPORARY: ENABLE_MANUAL_PAYMENT — Phase 3 chooser inserted between
// Checkout and the existing CashfreePaymentModal so the customer can
// branch into the cash + admin-confirm flow. Remove this component +
// revert ShopPage's handleCheckout back to setPayment() directly once
// Cashfree clears the whitelist.

/**
 * PaymentMethodChooser — full-screen modal with two big buttons.
 *
 * Props:
 *   amount  — total INR (for the header)
 *   onCash  — invoked when Cash is selected (closes self, opens cash modal)
 *   onUpi   — invoked when UPI is selected (closes self, opens existing
 *             CashfreePaymentModal — the QR flow is untouched)
 *   onClose — invoked on Cancel (no payment started)
 */
export default function PaymentMethodChooser({ amount, onCash, onUpi, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose payment method"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998, // just under CashfreePaymentModal's 99999
        background:
          'radial-gradient(120% 120% at 50% 0%, #15203a 0%, #0a0d14 60%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        padding: 24,
      }}
    >
      <div style={{ width: 'min(560px, 100%)', textAlign: 'center' }}>
        <div
          style={{
            fontSize: 12,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#6B7280',
            marginBottom: 12,
          }}
        >
          Payment Method
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            marginBottom: 6,
            letterSpacing: -1,
          }}
        >
          ₹ {Number(amount).toLocaleString('en-IN')}
        </div>
        <div style={{ color: '#9CA3AF', fontSize: 15, marginBottom: 36 }}>
          How would you like to pay?
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 28,
          }}
        >
          <button
            type="button"
            onClick={onCash}
            style={methodButton('linear-gradient(135deg, #f59e0b, #d97706)')}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>💵</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Cash</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
              Pay at the counter,<br />admin will confirm
            </div>
          </button>

          <button
            type="button"
            onClick={onUpi}
            style={methodButton('linear-gradient(135deg, #3b82f6, #1d4ed8)')}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>UPI</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
              Scan a QR with<br />any UPI app
            </div>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#9CA3AF',
            padding: '10px 22px',
            borderRadius: 10,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function methodButton(gradient) {
  return {
    background: gradient,
    border: 'none',
    color: '#fff',
    padding: '32px 20px',
    borderRadius: 16,
    cursor: 'pointer',
    boxShadow: '0 8px 24px -6px rgba(0,0,0,0.45)',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
  };
}
