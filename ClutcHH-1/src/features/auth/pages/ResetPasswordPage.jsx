import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import { authService } from '../services/authService';
import '../../../styles/LoginPage.css';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Email is passed from ForgotPasswordPage via router state. Fall back to
  // a manual entry field if the user landed here directly (e.g. opened the
  // page from history) — they need to provide the email the OTP was sent to.
  const initialEmail =
    (location.state && location.state.email) ||
    (typeof window !== 'undefined' ? window.localStorage.getItem('primus_reset_email') || '' : '');

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim()) return setError('Email is required.');
    const otpDigits = otp.replace(/\D/g, '');
    if (otpDigits.length !== 6) return setError('Enter the 6-digit code from your email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setSubmitting(true);
    try {
      await authService.resetPassword({
        email: email.trim(),
        otp: otpDigits,
        newPassword: password,
      });
      setDone(true);
      try {
        window.localStorage.removeItem('primus_reset_email');
      } catch {
        /* ignore */
      }
      setTimeout(() => navigate(ROUTES.login, { replace: true }), 1200);
    } catch (err) {
      // Backend returns specific error messages for used / expired codes
      // and a generic "Invalid or expired code" for everything else.
      // 429 (rate limit) and 422 (pydantic) sometimes return `detail` as
      // an object/array — stringify defensively so React doesn't render
      // "[object Object]" or crash on a non-string child.
      const raw =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        'Reset failed. Request a new code.';
      let msg;
      if (typeof raw === 'string') {
        msg = raw;
      } else if (Array.isArray(raw)) {
        msg = raw
          .map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
          .join('; ');
      } else if (raw && typeof raw === 'object') {
        msg = raw.msg || raw.message || JSON.stringify(raw);
      } else {
        msg = String(raw);
      }
      // Friendly translation for the most common edge cases.
      if (err?.response?.status === 429) {
        msg = 'Too many attempts — please wait a minute and try again.';
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) return setError('Enter your email first.');
    setResending(true);
    try {
      await authService.requestReset(email.trim());
      setInfo("We've emailed you a fresh 6-digit code.");
    } catch (err) {
      setError(err?.message || 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

  const passwordIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.8333 8.33341H16.6667C17.1269 8.33341 17.5 8.7065 17.5 9.16675V17.5001C17.5
        17.9603 17.1269 18.3334 16.6667 18.3334H3.33333C2.8731 18.3334 2.5 17.9603 2.5
        17.5001V9.16675C2.5 8.7065 2.8731 8.33341 3.33333 8.33341H4.16667V7.50008C4.16667
        4.27842 6.77834 1.66675 10 1.66675C13.2217 1.66675 15.8333 4.27842 15.8333
        7.50008V8.33341ZM4.16667 10.0001V16.6667H15.8333V10.0001H4.16667ZM9.16667
        11.6667H10.8333V15.0001H9.16667V11.6667ZM14.1667 8.33341V7.50008C14.1667 5.1989
        12.3012 3.33341 10 3.33341C7.69882 3.33341 5.83333 5.1989 5.83333
        7.50008V8.33341H14.1667Z"
        fill="#6B7280"
      />
    </svg>
  );

  const emailIcon = (
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
  );

  const otpIcon = (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 1.667a3.333 3.333 0 0 1 3.333 3.333v1.667h1.667a1.667 1.667 0 0
        1 1.667 1.666v8.334A1.667 1.667 0 0 1 15 18.333H5a1.667 1.667 0 0 1-1.667-1.666V8.333A1.667
        1.667 0 0 1 5 6.667h1.667V5A3.333 3.333 0 0 1 10 1.667Zm0 1.666A1.667 1.667 0 0 0
        8.333 5v1.667h3.334V5A1.667 1.667 0 0 0 10 3.333Zm-5 5v8.334h10V8.333H5Z"
        fill="#6B7280"
      />
    </svg>
  );

  return (
    <div className="LoginBody">
      <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Reset password</h1>
          <p className="card-subtitle">
            Enter the 6-digit code we emailed you, then choose a new password.
          </p>
          <form noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="reset-email">Email</label>
              <div className="field-wrap">
                <span className="field-icon">{emailIcon}</span>
                <input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={Boolean(initialEmail)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="reset-otp">6-digit code</label>
              <div className="field-wrap">
                <span className="field-icon">{otpIcon}</span>
                <input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="firmpassword">New password</label>
              <div className="field-wrap">
                <span className="field-icon">{passwordIcon}</span>
                <input
                  id="firmpassword"
                  type="password"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="conpassword">Confirm password</label>
              <div className="field-wrap">
                <span className="field-icon">{passwordIcon}</span>
                <input
                  id="conpassword"
                  type="password"
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p style={{ color: '#E8364F', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
            )}
            {info && (
              <p style={{ color: '#059669', fontSize: 13, margin: '0 0 12px' }}>{info}</p>
            )}
            {done && (
              <p style={{ color: '#059669', fontSize: 13, margin: '0 0 12px' }}>
                Password reset — taking you back to sign in.
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={submitting || done}>
              {submitting ? 'Resetting…' : 'Reset Password'}
            </button>

            <p className="form-footer" style={{ marginTop: 12 }}>
              Didn't get the code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="link"
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  cursor: resending ? 'wait' : 'pointer',
                  color: '#E8364F',
                  fontWeight: 600,
                }}
              >
                {resending ? 'Resending…' : 'Resend'}
              </button>
            </p>

            <p className="form-footer">
              Remembered it?{' '}
              <Link to={ROUTES.login} className="link">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
