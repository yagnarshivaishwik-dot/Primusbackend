import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import useAuthStore from '../stores/authStore';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Get the page user was trying to access before being redirected to login
  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (isAuthenticated) {
      // Redirect to the page user was trying to access, or dashboard
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  useEffect(() => {
    clearError();
  }, [username, password, clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(username, password);
    if (result.success) {
      // Redirect to original page or change-password if required
      navigate(result.mustChangePassword ? '/change-password' : from, { replace: true });
    }
  };

  return (
    <div className="login-page">
      {/* Background Effects */}
      <div className="login-bg">
        <div className="login-bg__gradient login-bg__gradient--1" />
        <div className="login-bg__gradient login-bg__gradient--2" />
      </div>

      <div className="login-container">
        {/* Logo */}
        <div className="login-logo">
          <div className="login-logo__icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#loginLogoGrad)" />
              <path d="M2 17L12 22L22 17" stroke="url(#loginLogoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12L12 17L22 12" stroke="url(#loginLogoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="loginLogoGrad" x1="2" y1="2" x2="22" y2="22">
                  <stop stopColor="#3b82f6" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 className="login-logo__title">Primus</h1>
          <span className="login-logo__subtitle">Control Plane</span>
        </div>

        {/* Login Card */}
        <div className="login-card glass-card">
          <div className="login-card__header">
            <h2 className="login-card__title">Welcome back</h2>
            <p className="login-card__subtitle">Sign in to access your dashboard</p>
          </div>

          {error && (
            <div className="login-error">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            <div className="input-group">
              <label htmlFor="username" className="input-label">Username</label>
              <input
                type="text"
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label htmlFor="password" className="input-label">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--primary login-submit"
              disabled={isLoading || !username || !password}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <span>Authorized personnel only</span>
          </div>
        </div>

        {/* Version */}
        <p className="login-version">Primus Control Plane v1.0.0</p>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-8);
          position: relative;
          overflow: hidden;
        }

        .login-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .login-bg__gradient {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.5;
        }

        .login-bg__gradient--1 {
          width: 600px;
          height: 600px;
          top: -200px;
          right: -100px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%);
        }

        .login-bg__gradient--2 {
          width: 500px;
          height: 500px;
          bottom: -150px;
          left: -100px;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.25) 0%, transparent 70%);
        }

        .login-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* Logo */
        .login-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: var(--space-10);
        }

        .login-logo__icon {
          width: 64px;
          height: 64px;
          margin-bottom: var(--space-4);
        }

        .login-logo__icon svg {
          width: 100%;
          height: 100%;
        }

        .login-logo__title {
          font-size: var(--text-3xl);
          font-weight: 600;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, var(--text-primary) 0%, var(--text-secondary) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .login-logo__subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
          margin-top: var(--space-1);
        }

        /* Login Card */
        .login-card {
          width: 100%;
          padding: var(--space-8);
        }

        .login-card__header {
          text-align: center;
          margin-bottom: var(--space-6);
        }

        .login-card__title {
          font-size: var(--text-xl);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .login-card__subtitle {
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        .login-error {
          padding: var(--space-4);
          background: var(--status-danger-subtle);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-md);
          color: var(--status-danger);
          font-size: var(--text-sm);
          margin-bottom: var(--space-6);
          text-align: center;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }

        .password-input-wrapper {
          position: relative;
        }

        .password-input-wrapper .input {
          padding-right: 48px;
        }

        .password-toggle {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          padding: 6px;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: color var(--duration-fast) var(--ease-out);
        }

        .password-toggle:hover {
          color: var(--text-primary);
        }

        .login-submit {
          width: 100%;
          padding: 14px;
          margin-top: var(--space-2);
        }

        .login-footer {
          margin-top: var(--space-6);
          padding-top: var(--space-6);
          border-top: 1px solid var(--divider);
          text-align: center;
          font-size: var(--text-xs);
          color: var(--text-quaternary);
        }

        .login-version {
          margin-top: var(--space-8);
          font-size: var(--text-xs);
          color: var(--text-quaternary);
        }
      `}</style>
    </div>
  );
}
