import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import useSessionStore from '@/app/store/useSessionStore';
import { invoke, hasBridge } from '@/app/bridge/invoke';
import '../../../styles/LoginPage.css';

function LoginPage() {
  const navigate = useNavigate();
  const signIn = useSessionStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // True after a cafe-less rejection — surfaces the "Switch to admin
  // setup" affordance inline next to the error message so the customer
  // (or an admin assisting them) has a one-click way back to SetupPage.
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);

  /**
   * Reset device credentials and reload. App.jsx's boot effect will
   * then find no device.bin and show SetupPage (which gates the
   * handshake to admin / superadmin accounts after the recent fix).
   * Confirmation prompt because this WIPES the current cafe binding.
   */
  const handleAdminSetup = async () => {
    if (!hasBridge()) {
      setError('Admin setup is only available on the kiosk host.');
      return;
    }
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      'This will unbind the kiosk from its cafe and require admin credentials to re-bind. Continue?',
    );
    if (!ok) return;
    try {
      await invoke('reset_device_credentials');
    } catch {
      /* even if the bridge call fails, reload — App.jsx will re-evaluate */
    }
    window.location.reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setNeedsAdminSetup(false);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ email: trimmedEmail, password });
      navigate(ROUTES.home, { replace: true });
    } catch (err) {
      const message = err?.message || 'Sign in failed. Check credentials and try again.';
      setError(message);
      // Detect the cafe-less rejection from useSessionStore.signIn and
      // auto-redirect to admin login. handleAdminSetup() shows a
      // confirm() before actually resetting the binding — that's the
      // safety prompt so a customer typo can't silently wipe device.bin.
      if (/registered with this cafe|admin account/i.test(message)) {
        setNeedsAdminSetup(true);
        handleAdminSetup();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <div className="LoginBody">
      {/* Login Start */}
      <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Welcome back</h1>
          <p className="card-subtitle">Sign in to your NoLag account</p>
          <form noValidate onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
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
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
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
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <label className="checkbox">
                <input type="checkbox" />
                <span className="checkbox-box"></span>
                <span>Remember me</span>
              </label>
              <Link to={ROUTES.forgotPassword} className="link">
                Forgot password?
              </Link>
            </div>

            {error && (
              <div role="alert" style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 12,
              }}>
                <div>{error}</div>
                {needsAdminSetup && (
                  <button
                    type="button"
                    onClick={handleAdminSetup}
                    style={{
                      marginTop: 10,
                      padding: '8px 14px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #ff9a4a, #ff5b1f)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Switch to admin login
                  </button>
                )}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>

            <p className="form-footer">
              Don't have an account?{' '}
              <Link to={ROUTES.signup} className="link">
                Sign up
              </Link>
            </p>

            <div className="divider">
              <span className="divider-line"></span>
              <span className="divider-text">or continue with</span>
              <span className="divider-line"></span>
            </div>

            <div className="social">
              <button type="button" className="btn-social">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#E5E7EB"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#E5E7EB"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#E5E7EB"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#E5E7EB"
                  />
                </svg>
                Continue with Google
              </button>

              <button type="button" className="btn-social">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Continue with Apple
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* Login End */}

      {/* SignUp Start */}
      {/* <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Create account</h1>
          <p className="card-subtitle">Join 50K+ players on NoLag</p>
          <form novalidate onsubmit="return false">
            <div className="field">
              <label htmlFor="name">Full Name</label>
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
                      d="M3.3335 18.3333C3.3335 14.6513 6.31826 11.6666 10.0002 11.6666C13.6821 
  11.6666 16.6668 14.6513 16.6668 18.3333H15.0002C15.0002 15.5718 12.7616 13.3333 
  10.0002 13.3333C7.23874 13.3333 5.00016 15.5718 5.00016 18.3333H3.3335ZM10.0002 
  10.8333C7.23766 10.8333 5.00016 8.59575 5.00016 5.83325C5.00016 3.07075 7.23766 
  0.833252 10.0002 0.833252C12.7627 0.833252 15.0002 3.07075 15.0002 5.83325C15.0002 
  8.59575 12.7627 10.8333 10.0002 10.8333ZM10.0002 9.16658C11.8418 9.16658 13.3335 
  7.67492 13.3335 5.83325C13.3335 3.99159 11.8418 2.49992 10.0002 2.49992C8.1585 
  2.49992 6.66683 3.99159 6.66683 5.83325C6.66683 7.67492 8.1585 9.16658 10.0002 
  9.16658Z"
                      fill="#6B7280"
                    />
                  </svg>
                </span>
                <input id="name" type="text" placeholder="Alex Chen" autoComplete="text" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
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
                <input id="email" type="email" placeholder="you@example.com" autoComplete="email" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
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
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder="Min. 6 characters"
                  // autocomplete="current-password"
                />
              </div>
            </div>
            <div className="field">
              <label for="password">Confirm Password</label>
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
                </span>
                <input
                  id="confirmpassword"
                  type="password"
                  placeholder="Re-enter password"
                  // autocomplete="current-password"
                />
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox">
                <input type="checkbox" />
                <span className="checkbox-box"></span>
                <span>I agree to the Terms and Privacy Policy</span>
              </label>
            </div>

            <button type="submit" className="btn-primary">
              Create Account
            </button>

            <p className="form-footer">
              Already have an account?{' '}
              <a href="#" className="link">
                Sign in
              </a>
            </p>
          </form>
        </div>
      </div> */}
      {/* SignUp End */}

      {/* Forgot pwd  start*/}
      {/* <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Forgot password?</h1>
          <p className="card-subtitle">No worries, we'll send you a reset link</p>
          <form novalidate onsubmit="return false">
            <div className="field">
              <label htmlFor="email">Email</label>
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
                <input id="email" type="email" placeholder="you@example.com" autoComplete="email" />
              </div>
            </div>

            <button type="submit" className="btn-primary">
              Send Reset Link
            </button>
             <div className="divider">
              <span>
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M2.55229 4.51881H10.6667V5.85215H2.55229L6.12827 9.42808L5.18547 10.3709L0 5.18548L5.18547 0L6.12827 0.942807L2.55229 4.51881Z" fill="#9CA3AF"/>
</svg>
              </span>
              <span className="divider-text">Back to login</span>
            </div>
          </form>
        </div>
      </div> */}
      {/* Forgot pwd end*/}

      {/* Reset pwd  start*/}
      {/* <div className="CardMain">
        <div className="card">
          <h1 className="card-title">Reset password</h1>
          <p className="card-subtitle">Choose a new password for your account</p>
          <form novalidate onsubmit="return false">
            <div className="field">
              <label htmlFor="password">Password</label>
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
                </span>
                <input
                  id="firmpassword"
                  type="password"
                  placeholder="Min. 6 characters"
                  // autocomplete="current-password"
                />
              </div>
            </div>
            <div className="field">
              <label for="password">Confirm Password</label>
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
                </span>
                <input
                  id="conpassword"
                  type="password"
                  placeholder="Re-enter password"
                  // autocomplete="current-password"
                />
              </div>
            </div>

            <button type="submit" className="btn-primary">
              Reset Password
            </button>
          </form>
        </div>
      </div> */}
      {/* Reset pwd end*/}
      </div>
    </>
  );
}

export default LoginPage;
