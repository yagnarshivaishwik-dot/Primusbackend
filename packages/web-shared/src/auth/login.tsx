import React, { useState, FormEvent } from 'react';

/**
 * Shared <SharedLogin /> skeleton.
 *
 * Each SPA wraps this with its own branding chrome and passes its own
 * `onSubmit` handler that hits the SPA-specific login endpoint
 * (/api/auth/login for admin, /internal/auth/login for SuperAdmin,
 * /api/v1/auth/login for the kiosk).
 *
 * Forensic audit P4: extracted from three near-identical implementations
 * across the three SPAs. The shared skeleton ensures consistent client-
 * side validation, rate-limit feedback, and accessible markup.
 */

export interface SharedLoginProps {
  title?: string;
  /**
   * Resolves with `{ ok: true }` on success, or
   * `{ ok: false, error: string }` so the form can render the message.
   * Implementations should NOT navigate themselves — the consumer SPA
   * handles redirect after a successful submit.
   */
  onSubmit: (
    credentials: { username: string; password: string },
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Optional secondary action (e.g. "Forgot password?").
   */
  onForgotPassword?: () => void;
}

export function SharedLogin({
  title = 'Sign in',
  onSubmit,
  onForgotPassword,
}: SharedLoginProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await onSubmit({ username: username.trim(), password });
      if (!result.ok) {
        setError(result.error || 'Sign-in failed.');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Sign-in failed.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting}>
      <h1>{title}</h1>

      <label htmlFor="primus-login-username">Email or username</label>
      <input
        id="primus-login-username"
        type="text"
        autoComplete="username"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />

      <label htmlFor="primus-login-password">Password</label>
      <input
        id="primus-login-password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && (
        <p role="alert" data-testid="primus-login-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      {onForgotPassword && (
        <button type="button" onClick={onForgotPassword}>
          Forgot password?
        </button>
      )}
    </form>
  );
}
