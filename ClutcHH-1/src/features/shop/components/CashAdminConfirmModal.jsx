// TEMPORARY: ENABLE_MANUAL_PAYMENT — Phase 3 cash-payment admin confirm modal.
// Opens after the customer chooses "Cash" in PaymentMethodChooser.
// On admin-verified success the backend creates UserOffer(s) and
// broadcasts time_updated → PackageGuard automatically lifts the paywall.
// Remove this file + the matching switch in ShopPage to retire the
// feature once Cashfree clears.

import { useState } from 'react';

import { cashAdminCredit } from '@/features/shop/services/paymentCashService';
import useWalletStore from '@/app/store/useWalletStore';

/**
 * Props:
 *   amount       — total INR shown in header (display only)
 *   packs        — [{ id, qty }] forwarded to backend
 *   note         — optional cart description
 *   onSuccess(result) — called when the package is credited
 *   onClose()    — user cancelled or hit X
 */
export default function CashAdminConfirmModal({ amount, packs, note, onSuccess, onClose }) {
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const refreshActivePackage = useWalletStore((s) => s.refreshActivePackage);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    setError(null);

    const email = adminEmail.trim();
    if (!email || !adminPassword) {
      setError('Admin email and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await cashAdminCredit({
        adminEmail: email,
        adminPassword,
        packs,
        note,
      });
      // Refresh the active-package state immediately so the PackageGuard
      // lifts even if the WS time_updated event hiccups. Polling
      // fallback also covers that case but this is the fast path.
      try { await refreshActivePackage?.(); } catch { /* poll covers */ }
      onSuccess?.(result);
    } catch (err) {
      const msg = err?.message || 'Cash credit failed. Try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cash payment — admin confirmation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        autoComplete="off"
        style={{
          width: 'min(440px, 100%)',
          background: 'linear-gradient(180deg, #141a2e 0%, #0d1224 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16,
          padding: 28,
          color: '#fff',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#6B7280',
            }}
          >
            Cash Payment
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
            ₹ {Number(amount).toLocaleString('en-IN')}
          </div>
          <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 6 }}>
            Admin must confirm payment received.
          </div>
        </div>

        <label style={fieldLabel}>
          Admin email
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            disabled={submitting}
            autoFocus
            // anon name + autoComplete=off so the kiosk browser doesn't
            // offer to save a kiosk-shared admin password.
            autoComplete="off"
            name="_pa_admin_email"
            placeholder="admin@example.com"
            style={fieldInput}
          />
        </label>

        <label style={fieldLabel}>
          Admin password
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            disabled={submitting}
            autoComplete="new-password"
            name="_pa_admin_password"
            placeholder="••••••••"
            style={fieldInput}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 14,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              background: submitting
                ? 'rgba(245, 158, 11, 0.55)'
                : 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: 'none',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            {submitting ? 'Verifying…' : 'Confirm payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldLabel = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  color: '#9CA3AF',
  letterSpacing: 0.4,
};

const fieldInput = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 10,
  padding: '12px 14px',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
  fontFamily: 'inherit',
};
