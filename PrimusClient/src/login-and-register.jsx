import React, { useState, useEffect } from "react";
import axios from "axios";
import { Mail, Lock, User, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { getApiBase, setApiBase, presetApiBases, showToast, csrfHeaders } from "./utils/api";

// Google Web Client ID from environment
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || "";

// Load Google Identity Services script
let _gsiLoading = null;
function loadGsiScript() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (_gsiLoading) return _gsiLoading;
    _gsiLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(s);
    });
    return _gsiLoading;
}

// Social callback listener
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

// Google button component
function GoogleButton({ onLoginSuccess }) {
    const btnRef = React.useRef(null);
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                await loadGsiScript();
                if (!mounted) return;
                window.google.accounts.id.initialize({
                    client_id: GOOGLE_WEB_CLIENT_ID,
                    callback: async (response) => {
                        try {
                            const base = getApiBase().replace(/\/$/, "");
                            const res = await axios.post(`${base}/api/social/google/idtoken`, {
                                id_token: response.credential,
                                client_id: GOOGLE_WEB_CLIENT_ID
                            }, { headers: { 'Content-Type': 'application/json', ...csrfHeaders() } });
                            const token = res?.data?.access_token;
                            if (token) {
                                localStorage.setItem('primus_jwt', token);
                                if (typeof onLoginSuccess === 'function') onLoginSuccess(token);
                                showToast('Signed in with Google');
                            } else {
                                showToast('Google sign-in failed');
                            }
                        } catch (e) {
                            showToast('Google sign-in failed');
                        }
                    },
                });
                if (btnRef.current) {
                    window.google.accounts.id.renderButton(btnRef.current, {
                        type: 'standard',
                        theme: 'filled_black',
                        size: 'large',
                        text: 'continue_with',
                        logo_alignment: 'center',
                        shape: 'rectangular',
                        width: btnRef.current.offsetWidth,
                    });
                }
            } catch (_) { }
        })();
        return () => { mounted = false; };
    }, [onLoginSuccess]);
    return <div ref={btnRef} className="google-btn-container" />;
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

// Forgot Password View
const ForgotPasswordView = ({ setScreen }) => (
    <div className="auth-card">
        <button className="auth-back-btn" onClick={() => setScreen('login')}>
            <ArrowLeft size={18} />
            Back to login
        </button>

        <h2 className="auth-title">Forgot Password?</h2>
        <p className="auth-subtitle">Enter your email to reset your password</p>

        <form className="auth-form">
            <div className="auth-input-group">
                <Mail size={18} className="auth-input-icon" />
                <input
                    type="email"
                    placeholder="Email Address"
                />
            </div>

            <button type="submit" className="auth-btn-primary">
                Send Reset Link
            </button>
        </form>
    </div>
);

// Main Auth Component
export default function AuthCombined({ onLogin }) {
    const [screen, setScreen] = useState('login');

    const renderContent = () => {
        switch (screen) {
            case 'register':
                return <RegisterView setScreen={setScreen} onLogin={onLogin} />;
            case 'forgotPassword':
                return <ForgotPasswordView setScreen={setScreen} />;
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
