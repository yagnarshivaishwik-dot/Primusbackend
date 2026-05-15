import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import { authService } from '@/features/auth/services/authService';
import './SignUpPage.css';

const OTP_LENGTH = 6;
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

function IconPerson() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 10.833a4.167 4.167 0 1 0 0-8.333 4.167 4.167 0 0 0 0 8.333Zm0 1.667c-3.682 0-6.667 2.985-6.667 6.667h13.334c0-3.682-2.985-6.667-6.667-6.667Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="m3 5 7 6 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2.5 8h15M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 3h3l1.5 3.5L7.5 8.5a10 10 0 0 0 4 4l2-2L17 12v3a2 2 0 0 1-2 2A12 12 0 0 1 3 5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3.5" y="8.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 8.5V6a4 4 0 1 1 8 0v2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconEye({ off }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 3l14 14M8.2 8.2a3 3 0 0 0 3.6 3.6M6 6.2C3.5 7.9 2 10 2 10s3 5.5 8 5.5c1.4 0 2.6-.3 3.7-.9M14.8 13.8c2-1.6 3.2-3.8 3.2-3.8s-3-5.5-8-5.5c-.9 0-1.8.2-2.5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 10s3-5.5 8-5.5 8 5.5 8 5.5-3 5.5-8 5.5S2 10 2 10Z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}
function IconArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8.5 4 3 9.5l5.5 5.5M3 9.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function GoogleLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.86.92 7.5 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function SignUpPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const otpRefs = useRef([]);
  const otpValue = otp.join('');
  const canSendOtp = isValidEmail(email) && !otpVerified && !otpBusy;
  const canVerifyOtp = otpValue.length === OTP_LENGTH && !otpVerified && !otpBusy;

  const handleSendOtp = async () => {
    if (!canSendOtp) return;
    setError(null);
    setOtpBusy(true);
    try {
      await authService.sendOtp(email);
      setOtpSent(true);
      setOtp(Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(err?.message || 'Could not send OTP. Try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!canVerifyOtp) return;
    setError(null);
    setOtpBusy(true);
    try {
      await authService.verifyOtp(email, otpValue);
      setOtpVerified(true);
    } catch (err) {
      setError(err?.message || 'Invalid OTP. Check your email and try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };
  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
  };
  const handleOtpPaste = (e) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!paste) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < paste.length; i++) next[i] = paste[i];
    setOtp(next);
    otpRefs.current[Math.min(paste.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // Validate required fields BEFORE submitting. Without this, clicking
    // the button with empty fields used to just navigate back to login.
    const missing = [];
    if (!username.trim()) missing.push('username');
    if (!firstName.trim()) missing.push('first name');
    if (!lastName.trim()) missing.push('last name');
    if (!isValidEmail(email)) missing.push('a valid email');
    if (!otpVerified) missing.push('verified email (tap Send OTP → Verify)');
    if (!password) missing.push('password');
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!agree) missing.push('accepting the terms');
    if (missing.length) {
      setError(`Please provide: ${missing.join(', ')}.`);
      return;
    }

    setSubmitting(true);
    try {
      await authService.signUp({
        username: username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        dob: dob || null,
        phone: phone.trim() || null,
      });
      // Success → go to login so user can sign in with their new creds.
      navigate(ROUTES.login, { replace: true });
    } catch (err) {
      setError(err?.message || 'Could not create account. Try a different email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <Link to={ROUTES.login} className="back-link">
          <IconArrowLeft />
          Back to login
        </Link>

        <h1 className="signup-title">Create Account</h1>
        <p className="signup-sub">Join the ClutcHH gaming community</p>

        <button type="button" className="google-btn">
          <span className="google-btn__icon"><GoogleLogo /></span>
          Continue with Google
        </button>

        <div className="signup-divider">or register with email</div>

        <form noValidate onSubmit={handleCreateAccount}>
          <div className="signup-field">
            <span className="signup-field__icon"><IconPerson /></span>
            <input
              className="signup-input"
              type="text"
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="signup-field">
            <span className="signup-field__icon"><IconPerson /></span>
            <input
              className="signup-input"
              type="text"
              placeholder="First Name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div className="signup-field">
            <span className="signup-field__icon"><IconPerson /></span>
            <input
              className="signup-input"
              type="text"
              placeholder="Last Name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div className="signup-field">
            <span className="signup-field__icon"><IconMail /></span>
            <input
              className="signup-input"
              type="email"
              placeholder="Email Address"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                if (otpVerified) return;
                setEmail(e.target.value);
                if (otpSent) {
                  setOtpSent(false);
                  setOtp(Array(OTP_LENGTH).fill(''));
                }
              }}
              disabled={otpVerified}
            />
          </div>

          {!otpSent && !otpVerified && (
            <button
              type="button"
              className="send-otp-btn"
              onClick={handleSendOtp}
              disabled={!canSendOtp}
            >
              Send OTP
            </button>
          )}

          {otpSent && !otpVerified && (
            <>
              <button
                type="button"
                className="resend-btn"
                onClick={handleSendOtp}
              >
                Resend
              </button>

              <label className="otp-label">Enter 6-digit OTP</label>
              <div className="otp-boxes" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    className={`otp-box${digit ? ' otp-box--filled' : ''}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    aria-label={`OTP digit ${i + 1}`}
                  />
                ))}
              </div>

              <div className="verify-otp-row">
                <button
                  type="button"
                  className="verify-otp-btn"
                  onClick={handleVerifyOtp}
                  disabled={!canVerifyOtp}
                >
                  Verify OTP
                </button>
              </div>
            </>
          )}

          {otpVerified && <p className="otp-status otp-status--ok">Email verified</p>}

          <div className="signup-field">
            <span className="signup-field__icon"><IconCalendar /></span>
            <input
              className="signup-input"
              type="text"
              placeholder="Date of Birth (DD/MM/YYYY)"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>

          <div className="signup-field">
            <span className="signup-field__icon"><IconPhone /></span>
            <input
              className="signup-input"
              type="tel"
              placeholder="Phone Number (Optional)"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="signup-field password-wrap">
            <span className="signup-field__icon"><IconLock /></span>
            <input
              className="signup-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password (max 32 characters)"
              autoComplete="new-password"
              maxLength={32}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <IconEye off={showPassword} />
            </button>
          </div>

          <div className="signup-field">
            <span className="signup-field__icon"><IconLock /></span>
            <input
              className="signup-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirm Password"
              autoComplete="new-password"
              maxLength={32}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          <label className="terms-row">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              I agree to the{' '}
              <a href="#" className="terms-link">Terms of Service</a> and{' '}
              <a href="#" className="terms-link">Privacy Policy</a>
            </span>
          </label>

          {error && (
            <div
              role="alert"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          <button type="submit" className="create-btn" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <p className="signup-footer">
          Already have an account?{' '}
          <Link to={ROUTES.login} className="link">Sign In</Link>
        </p>
      </div>
    </div>
  );
}

export default SignUpPage;
