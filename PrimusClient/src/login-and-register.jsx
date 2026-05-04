import React, { useState, useEffect } from "react";
import axios from "axios";
import { Mail, Lock, User, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { getApiBase, setApiBase, presetApiBases, showToast, csrfHeaders } from "./utils/api";

// Social callback listener — picks up ?token=... when the backend redirects
// back to the kiosk after a successful OAuth round-trip. Also accepts a
// postMessage from a popup window if one is ever used.
function SocialCallbackListener({ onLogin }) {
    useEffect(() => {
        const urlHandler = () => {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            if (token) {
                try { localStorage.setItem('primus_jwt', token); } catch { }
                if (typeof onLogin === 'function') onLogin(token);
                const url = new URL(window.location.href);
                url.searchParams.delete('token');
                window.history.replaceState({}, '', url.toString());
            }
        };
        const msgHandler = (e) => {
            try {
                if (e?.data?.type === 'primus_auth' && e?.data?.token) {
                    try { localStorage.setItem('primus_jwt', e.data.token); } catch { }
                    if (typeof onLogin === 'function') onLogin(e.data.token);
                }
            } catch { }
        };
        urlHandler();
        window.addEventListener('message', msgHandler);
        return () => window.removeEventListener('message', msgHandler);
    }, [onLogin]);
    return null;
}

// Google sign-in button — redirect flow.
//
// We deliberately do NOT use Google Identity Services (GSI) here because
// GSI validates the calling page's origin against Cloud Console's
// authorized JavaScript origins list, and Google rejects every shape the
// kiosk's WebView2 virtual host can take (.local, *.localhost, raw IP,
// publicly-resolving subdomains break SetVirtualHostNameToFolderMapping).
//
// Redirect flow side-steps the whole problem: the kiosk just navigates to
// the backend's /api/social/login/google?state=<return-url>. Backend
// redirects to Google's consent screen. Google redirects back to the
// backend's /api/social/auth/google?code=... — that callback URL only
// needs to be in Cloud Console's "Authorized redirect URIs", which IS a
// real public-TLD URL (https://api.primustech.in/api/social/auth/google).
// Backend then redirects to <state>?token=<jwt>; SocialCallbackListener
// above picks up the token from the URL.
function GoogleButton({ onLoginSuccess: _onLoginSuccess }) {
    const handleClick = () => {
        const apiBase = getApiBase().replace(/\/$/, "");
        // Where Google should bring the user back to after consent.
        // window.location.origin = "https://primus.local" inside WebView2.
        const returnUrl = window.location.origin + window.location.pathname;
        const url = `${apiBase}/api/social/login/google?state=${encodeURIComponent(returnUrl)}`;
        window.location.href = url;
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className="google-btn-redirect"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.75rem 1rem',
                background: '#1a1a1a',
                border: '1px solid #3a3a3a',
                borderRadius: '6px',
                color: '#fff',
                fontWeight: 500,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = '#262626';
                e.currentTarget.style.borderColor = '#4a4a4a';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.borderColor = '#3a3a3a';
            }}
        >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
        </button>
    );
}

// Login View
const LoginView = ({ setScreen, onLogin }) => {
    const [emailOrUsername, setEmailOrUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [apiBase, setApiBaseState] = useState(getApiBase());

    useEffect(() => {
        const onMessage = (e) => {
            try {
                if (e?.data?.type === 'primus_auth' && e?.data?.token) {
                    localStorage.setItem('primus_jwt', e.data.token);
                    if (typeof onLogin === 'function') onLogin(e.data.token);
                }
            } catch { }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [onLogin]);

    const submit = async (e) => {
        e?.preventDefault();
        setError("");
        try {
            setBusy(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/auth/login";
            const params = new URLSearchParams();
            params.append("username", emailOrUsername);
            params.append("password", password);
            const res = await axios.post(url, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...csrfHeaders() },
                timeout: 15000
            });
            const token = res?.data?.access_token;
            if (!token) throw new Error('Invalid response from server');
            localStorage.setItem("primus_jwt", token);
            if (typeof onLogin === 'function') onLogin(token);
        } catch (err) {
            const d = err?.response?.data;
            const detail = d?.detail ?? d;
            let msg = detail || err?.message || 'Login failed';
            if (Array.isArray(detail)) msg = detail.map(x => (x?.msg || String(x))).join('; ');
            if (typeof detail === 'object' && detail) msg = detail.msg || detail.error || JSON.stringify(detail);
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-card">
            {/* Logo */}
            <div className="auth-logo">
                <div className="auth-logo-icon">P</div>
                <span className="auth-logo-text">PRIMUS</span>
            </div>

            <h2 className="auth-title">Welcome Back</h2>
            <p className="auth-subtitle">Sign in to continue gaming</p>

            {/* Server Selector */}
            <div className="auth-server-select">
                <span>Server:</span>
                <select
                    value={apiBase}
                    onChange={(e) => { setApiBase(e.target.value); setApiBaseState(getApiBase()); }}
                >
                    {presetApiBases().map(b => (<option key={b} value={b}>{b}</option>))}
                </select>
            </div>

            <form onSubmit={submit} className="auth-form">
                {/* Email Input */}
                <div className="auth-input-group">
                    <Mail size={18} className="auth-input-icon" />
                    <input
                        type="text"
                        placeholder="Email or Username"
                        value={emailOrUsername}
                        onChange={(e) => setEmailOrUsername(e.target.value)}
                        autoComplete="username"
                    />
                </div>

                {/* Password Input */}
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                    />
                    <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="auth-error">{error}</div>
                )}

                {/* Login Button */}
                <button
                    type="submit"
                    className="auth-btn-primary"
                    disabled={busy}
                >
                    {busy ? 'Signing in...' : 'Sign In'}
                </button>
            </form>

            {/* Forgot Password */}
            <button
                className="auth-link"
                onClick={() => setScreen('forgotPassword')}
            >
                Forgot password?
            </button>

            {/* Divider */}
            <div className="auth-divider">
                <span>or continue with</span>
            </div>

            {/* Google Button */}
            <GoogleButton onLoginSuccess={onLogin} />

            {/* Register Link */}
            <p className="auth-register-link">
                Don't have an account?{' '}
                <button onClick={() => setScreen('register')}>Create Account</button>
            </p>
        </div>
    );
};

// Register View
const RegisterView = ({ setScreen, onLogin }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [username, setUsername] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [dob, setDob] = useState("");
    const [phone, setPhone] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const [otpBusy, setOtpBusy] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);

    const sendOTP = async () => {
        if (!email) { setError("Please enter your email first"); return; }
        setError("");
        try {
            setOtpBusy(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/send-otp/";
            await axios.post(url, { email }, { headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, timeout: 15000 });
            setOtpSent(true);
            showToast("OTP sent to your email");
        } catch (err) {
            const d = err?.response?.data;
            const detail = d?.detail ?? d;
            let msg = detail || err?.message || 'Failed to send OTP';
            if (Array.isArray(detail)) msg = detail.map(x => (x?.msg || String(x))).join('; ');
            if (typeof detail === 'object' && detail) msg = detail.msg || detail.error || JSON.stringify(detail);
            setError(msg);
        } finally {
            setOtpBusy(false);
        }
    };

    const verifyOTP = async () => {
        const otpCode = otp.join("");
        if (otpCode.length !== 6) { setError("Please enter complete OTP"); return; }
        setError("");
        try {
            setOtpBusy(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/verify-otp/";
            await axios.post(url, { email, otp: otpCode }, { headers: { 'Content-Type': 'application/json', ...csrfHeaders() }, timeout: 15000 });
            setOtpVerified(true);
            showToast("Email verified successfully");
        } catch (err) {
            const d = err?.response?.data;
            const detail = d?.detail ?? d;
            let msg = detail || err?.message || 'OTP verification failed';
            if (Array.isArray(detail)) msg = detail.map(x => (x?.msg || String(x))).join('; ');
            if (typeof detail === 'object' && detail) msg = detail.msg || detail.error || JSON.stringify(detail);
            setError(msg);
            setOtp(["", "", "", "", "", ""]);
        } finally {
            setOtpBusy(false);
        }
    };

    const handleOtpChange = (index, value) => {
        if (value.length > 1) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        if (value && index < 5) {
            const nextInput = document.getElementById(`otp-${index + 1}`);
            if (nextInput) nextInput.focus();
        }
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            const prevInput = document.getElementById(`otp-${index - 1}`);
            if (prevInput) prevInput.focus();
        }
    };

    const submit = async (e) => {
        e?.preventDefault();
        setError("");
        if (!otpVerified) { setError("Please verify your email first"); return; }
        if (!email || !password) { setError("Email and password are required"); return; }
        if (password !== confirmPassword) { setError("Passwords do not match"); return; }
        if (!termsAccepted) { setError("Please accept the Terms of Service"); return; }
        try {
            setBusy(true);
            const name = username.trim() || `${firstName} ${lastName}`.trim() || email.split('@')[0];
            const url = getApiBase().replace(/\/$/, "") + "/api/auth/register";
            const params = new URLSearchParams();
            params.append('name', name);
            params.append('email', email);
            params.append('password', password);
            params.append('role', 'client');
            if (firstName) params.append('first_name', firstName);
            if (lastName) params.append('last_name', lastName);
            if (dob) params.append('dob', dob);
            if (phone) params.append('phone', phone);
            await axios.post(url, params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...csrfHeaders() }, timeout: 15000 });
            showToast("Registration complete. Please log in.");
            setScreen('login');
        } catch (err) {
            const d = err?.response?.data;
            const detail = d?.detail ?? d;
            let msg = detail || err?.message || 'Registration failed';
            if (Array.isArray(detail)) msg = detail.map(x => (x?.msg || String(x))).join('; ');
            if (typeof detail === 'object' && detail) msg = detail.msg || detail.error || JSON.stringify(detail);
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-card" style={{ maxWidth: '480px' }}>
            <button className="auth-back-btn" onClick={() => setScreen('login')}>
                <ArrowLeft size={18} />
                Back to login
            </button>

            <h2 className="auth-title">Create Account</h2>
            <p className="auth-subtitle">Join the Primus gaming community</p>

            {/* Google Signup Option */}
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <GoogleButton onLoginSuccess={onLogin} />
            </div>

            <div className="auth-divider">
                <span>or register with email</span>
            </div>

            <form onSubmit={submit} className="auth-form">
                {/* Username */}
                <div className="auth-input-group">
                    <User size={18} className="auth-input-icon" />
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                {/* First Name / Last Name */}
                <div className="auth-input-row">
                    <div className="auth-input-group" style={{ flex: 1 }}>
                        <User size={18} className="auth-input-icon" />
                        <input
                            type="text"
                            placeholder="First Name"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                        />
                    </div>
                    <div className="auth-input-group" style={{ flex: 1 }}>
                        <User size={18} className="auth-input-icon" />
                        <input
                            type="text"
                            placeholder="Last Name"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                    </div>
                </div>

                {/* Email with OTP */}
                <div className="auth-input-row">
                    <div className="auth-input-group" style={{ flex: 1 }}>
                        <Mail size={18} className="auth-input-icon" />
                        <input
                            type="email"
                            placeholder="Email Address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    {!otpVerified && (
                        <button
                            type="button"
                            className="auth-btn-secondary"
                            disabled={otpBusy || !email}
                            onClick={sendOTP}
                        >
                            {otpBusy ? '...' : otpSent ? 'Resend' : 'Send OTP'}
                        </button>
                    )}
                </div>

                {/* OTP Input */}
                {otpSent && !otpVerified && (
                    <div className="auth-otp-section">
                        <p className="auth-otp-label">Enter 6-digit OTP</p>
                        <div className="auth-otp-inputs">
                            {otp.map((digit, index) => (
                                <input
                                    key={index}
                                    id={`otp-${index}`}
                                    type="text"
                                    maxLength="1"
                                    value={digit}
                                    onChange={(e) => handleOtpChange(index, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                    className="auth-otp-input"
                                />
                            ))}
                        </div>
                        <button
                            type="button"
                            className="auth-btn-secondary"
                            disabled={otpBusy || otp.join("").length !== 6}
                            onClick={verifyOTP}
                            style={{ width: '100%', marginTop: '0.5rem' }}
                        >
                            {otpBusy ? 'Verifying...' : 'Verify OTP'}
                        </button>
                    </div>
                )}

                {otpVerified && (
                    <div className="auth-success">✓ Email Verified</div>
                )}

                {/* Date of Birth */}
                <div className="auth-input-group">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-input-icon">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <input
                        type="text"
                        placeholder="Date of Birth (DD/MM/YYYY)"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                    />
                </div>

                {/* Phone */}
                <div className="auth-input-group">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="auth-input-icon">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                    <input
                        type="tel"
                        placeholder="Phone Number (Optional)"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>

                {/* Password */}
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password (max 32 characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={32}
                    />
                    <button
                        type="button"
                        className="auth-password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>

                {/* Confirm Password */}
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        maxLength={32}
                    />
                </div>

                {/* Terms Checkbox */}
                <label className="auth-checkbox">
                    <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    <span>I agree to the <a href="#" style={{ color: 'var(--accent-primary)' }}>Terms of Service</a> and <a href="#" style={{ color: 'var(--accent-primary)' }}>Privacy Policy</a></span>
                </label>

                {/* Error */}
                {error && (
                    <div className="auth-error">{error}</div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    className="auth-btn-primary"
                    disabled={busy || !otpVerified || !termsAccepted}
                >
                    {busy ? 'Creating...' : 'Create Account'}
                </button>
            </form>

            {/* Login Link */}
            <p className="auth-register-link">
                Already have an account?{' '}
                <button onClick={() => setScreen('login')}>Sign In</button>
            </p>
        </div>
    );
};

// Forgot Password View — step 1 of the OTP flow.
// POSTs the email to /api/auth/password/forgot which mails a 6-digit
// OTP. On success we hand the email to ResetPasswordView so the user
// doesn't have to retype it.
const ForgotPasswordView = ({ setScreen, setResetEmail }) => {
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim()) {
            showToast('Enter your email');
            return;
        }
        try {
            setSubmitting(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/auth/password/forgot";
            await axios.post(url, { email: email.trim() }, {
                headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            });
        } catch (err) {
            // Backend never reveals user existence; treat any error the
            // same as success so we don't leak it on the client either.
        } finally {
            setSubmitting(false);
        }
        // Always advance to the OTP step — that's the privacy-preserving UX.
        setResetEmail(email.trim());
        setScreen('resetPassword');
    };

    return (
        <div className="auth-card">
            <button className="auth-back-btn" onClick={() => setScreen('login')}>
                <ArrowLeft size={18} />
                Back to login
            </button>

            <h2 className="auth-title">Forgot Password?</h2>
            <p className="auth-subtitle">
                Enter your email and we'll send you a 6-digit code.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
                <div className="auth-input-group">
                    <Mail size={18} className="auth-input-icon" />
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />
                </div>

                <button type="submit" className="auth-btn-primary" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send code'}
                </button>
            </form>
        </div>
    );
};

// Reset Password View — step 2 of the OTP flow.
// User pastes the 6-digit code from the email and picks a new password.
// Submits to POST /api/auth/password/reset which surfaces specific
// errors for invalid / used / expired codes; we display them verbatim.
const ResetPasswordView = ({ setScreen, prefillEmail, onLogin: _onLogin }) => {
    const [email, setEmail] = useState(prefillEmail || '');
    const [otp, setOtp] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [resending, setResending] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim()) {
            showToast('Enter the email you used');
            return;
        }
        if (!/^\d{6}$/.test(otp.trim())) {
            showToast('Enter the 6-digit code from your email');
            return;
        }
        if (password.length < 8) {
            showToast('Password must be at least 8 characters');
            return;
        }
        if (password !== confirm) {
            showToast('Passwords do not match');
            return;
        }
        try {
            setSubmitting(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/auth/password/reset";
            await axios.post(url, {
                email: email.trim(),
                otp: otp.trim(),
                new_password: password,
            }, {
                headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            });
            setDone(true);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            showToast(detail || 'Could not reset password');
        } finally {
            setSubmitting(false);
        }
    };

    const handleResend = async () => {
        if (!email.trim()) {
            showToast('Enter your email above first');
            return;
        }
        try {
            setResending(true);
            const url = getApiBase().replace(/\/$/, "") + "/api/auth/password/forgot";
            await axios.post(url, { email: email.trim() }, {
                headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            });
            showToast('A new code has been emailed (if the account exists)');
        } catch {
            // Quiet — don't leak existence.
            showToast('A new code has been emailed (if the account exists)');
        } finally {
            setResending(false);
        }
    };

    if (done) {
        return (
            <div className="auth-card">
                <h2 className="auth-title">Password updated</h2>
                <p className="auth-subtitle">
                    You can now sign in with your new password.
                </p>
                <button
                    type="button"
                    className="auth-btn-primary"
                    onClick={() => setScreen('login')}
                >
                    Continue to login
                </button>
            </div>
        );
    }

    return (
        <div className="auth-card">
            <button className="auth-back-btn" onClick={() => setScreen('login')}>
                <ArrowLeft size={18} />
                Back to login
            </button>

            <h2 className="auth-title">Reset your password</h2>
            <p className="auth-subtitle">
                Enter the 6-digit code we emailed you and pick a new password.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
                <div className="auth-input-group">
                    <Mail size={18} className="auth-input-icon" />
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                    />
                </div>
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="\d{6}"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoComplete="one-time-code"
                        required
                        style={{ letterSpacing: '0.4em', fontFamily: 'monospace' }}
                    />
                </div>
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="New password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={8}
                    />
                    <button
                        type="button"
                        className="auth-input-toggle"
                        onClick={() => setShowPwd((v) => !v)}
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                        {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
                <div className="auth-input-group">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={8}
                    />
                </div>

                <button type="submit" className="auth-btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Update password'}
                </button>

                <button
                    type="button"
                    className="auth-link"
                    onClick={handleResend}
                    disabled={resending}
                    style={{ marginTop: '0.5rem' }}
                >
                    {resending ? 'Sending…' : "Didn't get it? Resend code"}
                </button>
            </form>
        </div>
    );
};

// Main Auth Component
export default function AuthCombined({ onLogin }) {
    const [screen, setScreen] = useState('login');
    // Carry the email from the forgot-password step into the reset step
    // so the user doesn't have to type it twice.
    const [resetEmail, setResetEmail] = useState('');

    const renderContent = () => {
        switch (screen) {
            case 'register':
                return <RegisterView setScreen={setScreen} onLogin={onLogin} />;
            case 'forgotPassword':
                return (
                    <ForgotPasswordView
                        setScreen={setScreen}
                        setResetEmail={setResetEmail}
                    />
                );
            case 'resetPassword':
                return (
                    <ResetPasswordView
                        setScreen={setScreen}
                        prefillEmail={resetEmail}
                        onLogin={onLogin}
                    />
                );
            case 'login':
            default:
                return <LoginView setScreen={setScreen} onLogin={onLogin} />;
        }
    };

    return (
        <div className="auth-container">
            {renderContent()}
            <SocialCallbackListener onLogin={onLogin} />
        </div>
    );
}
