import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Shield, Check, Loader2 } from 'lucide-react';
import useAuthStore from '../stores/authStore';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { changePassword, isLoading, error, clearError } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState(false);

  const validate = () => {
    if (newPassword.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const result = await changePassword(currentPassword, newPassword);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  };

  if (success) {
    return (
      <div className="change-password-page">
        <div className="change-password-container">
          <div className="success-card glass-card">
            <div className="success-icon"><Check size={32} /></div>
            <h2>Password Changed</h2>
            <p>Redirecting to dashboard...</p>
          </div>
        </div>
        <style>{`
          .change-password-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-8); }
          .change-password-container { width: 100%; max-width: 420px; }
          .success-card { padding: var(--space-10); text-align: center; }
          .success-icon { width: 64px; height: 64px; margin: 0 auto var(--space-6); background: var(--status-success-subtle); color: var(--status-success); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
          .success-card h2 { font-size: var(--text-xl); margin-bottom: var(--space-2); }
          .success-card p { color: var(--text-tertiary); }
        `}</style>
      </div>
    );
  }

  return (
    <div className="change-password-page">
      <div className="change-password-bg">
        <div className="change-password-bg__gradient change-password-bg__gradient--1" />
        <div className="change-password-bg__gradient change-password-bg__gradient--2" />
      </div>

      <div className="change-password-container">
        <div className="change-password-header">
          <div className="change-password-icon"><Shield size={32} /></div>
          <h1>Change Password</h1>
          <p>Please set a new secure password</p>
        </div>

        <div className="change-password-card glass-card">
          {(error || validationError) && (
            <div className="error-message">{error || validationError}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label className="input-label">Current Password</label>
              <div className="password-wrapper">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); clearError(); }}
                  placeholder="Enter current password"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">New Password</label>
              <div className="password-wrapper">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Confirm Password</label>
              <div className="password-wrapper">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={isLoading}
                />
                <button type="button" className="password-toggle" onClick={() => setShowPasswords(!showPasswords)}>
                  {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="password-requirements">
              <span className={newPassword.length >= 8 ? 'met' : ''}>• At least 8 characters</span>
              <span className={newPassword === confirmPassword && newPassword ? 'met' : ''}>• Passwords match</span>
            </div>

            <button type="submit" className="btn btn--primary submit-btn" disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}>
              {isLoading ? <><Loader2 size={18} className="spin" /> Changing...</> : <><Lock size={16} /> Change Password</>}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .change-password-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-8); position: relative; overflow: hidden; }
        .change-password-bg { position: absolute; inset: 0; z-index: 0; }
        .change-password-bg__gradient { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.5; }
        .change-password-bg__gradient--1 { width: 500px; height: 500px; top: -150px; right: -100px; background: radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%); }
        .change-password-bg__gradient--2 { width: 400px; height: 400px; bottom: -100px; left: -50px; background: radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%); }

        .change-password-container { position: relative; z-index: 1; width: 100%; max-width: 420px; }
        .change-password-header { text-align: center; margin-bottom: var(--space-8); }
        .change-password-icon { width: 64px; height: 64px; margin: 0 auto var(--space-4); background: var(--accent-primary-subtle); color: var(--accent-primary); border-radius: var(--radius-xl); display: flex; align-items: center; justify-content: center; }
        .change-password-header h1 { font-size: var(--text-2xl); font-weight: 600; margin-bottom: var(--space-2); }
        .change-password-header p { font-size: var(--text-sm); color: var(--text-tertiary); }

        .change-password-card { padding: var(--space-8); }
        .change-password-card .input-group { margin-bottom: var(--space-5); }

        .password-wrapper { position: relative; }
        .password-wrapper .input { padding-right: 48px; }
        .password-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); padding: 6px; background: transparent; border: none; color: var(--text-tertiary); cursor: pointer; border-radius: var(--radius-sm); }
        .password-toggle:hover { color: var(--text-primary); }

        .error-message { padding: var(--space-4); background: var(--status-danger-subtle); border: 1px solid rgba(239,68,68,0.2); border-radius: var(--radius-md); color: var(--status-danger); font-size: var(--text-sm); margin-bottom: var(--space-6); text-align: center; }

        .password-requirements { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-6); }
        .password-requirements span { font-size: var(--text-xs); color: var(--text-quaternary); transition: color var(--duration-fast); }
        .password-requirements span.met { color: var(--status-success); }

        .submit-btn { width: 100%; padding: 14px; }
      `}</style>
    </div>
  );
}
