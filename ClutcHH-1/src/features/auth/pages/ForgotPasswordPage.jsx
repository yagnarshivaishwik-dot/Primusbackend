import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import { authService } from '../services/authService';
import '../../../styles/LoginPage.css';

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await authService.requestReset(trimmed);
      setSent(true);
      // Backend now returns the 6-digit OTP via email. Pass the email
      // forward via router state so ResetPasswordPage can prefill it
      // and POST {email, otp, new_password} to /password/reset.
      setTimeout(
        () => navigate(ROUTES.resetPassword, { state: { email: trimmed } }),
        1200,
      );
    } catch (err) {
      const raw =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        'Could not send code. Try again.';
      let msg;
      if (typeof raw === 'string') msg = raw;
      else if (Array.isArray(raw))
        msg = raw
          .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
          .join('; ');
      else if (raw && typeof raw === 'object')
        msg = raw.msg || raw.message || JSON.stringify(raw);
      else msg = String(raw);
      if (err?.response?.status === 429)
        msg = 'Too many attempts — please wait a minute and try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="LoginBody">
      <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Forgot password?</h1>
          <p className="card-subtitle">No worries, we'll send you a reset link</p>
          <form noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="forgot-email">Email</label>
              <div className="field-wrap">
                <span className="field-icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2.49984 2.5H17.4998C17.9601 2.5 18.3332 2.8731 18.3332 3.33333V16.6667C18.3332
                      17.1269 17.9601 17.5 17.4998 17.5H2.49984C2.0396 17.5 1.6665 17.1269 1.6665
                      16.6667V3.33333C1.6665 2.8731 2.0396 2.5 2.49984 2.5ZM16.6665 6.0316L10.0597
                      11.9483L3.33317 6.01328V15.8333H16.6665V6.0316ZM3.75939 4.16667L10.0514
                      9.71833L16.2507 4.16667H3.75939Z"
                      fill="#6B7280"
                    />
                  </svg>
                </span>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p style={{ color: '#E8364F', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
            )}
            {sent && (
              <p style={{ color: '#059669', fontSize: 13, margin: '0 0 12px' }}>
                We've emailed you a 6-digit code — taking you to the reset page.
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send 6-Digit Code'}
            </button>

            <div className="divider">
              <span>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.55229 4.51881H10.6667V5.85215H2.55229L6.12827 9.42808L5.18547 10.3709L0 5.18548L5.18547 0L6.12827 0.942807L2.55229 4.51881Z" fill="#9CA3AF"/>
                </svg>
              </span>
              <Link to={ROUTES.login} className="divider-text" style={{ color: '#9CA3AF', textDecoration: 'none' }}>
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
