import React from 'react';

/**
 * Forensic audit: zero error boundaries across all three SPAs.
 *
 * This component catches render-time + lifecycle errors below it and
 * renders a small "Reload section" fallback so a single broken page
 * doesn't blank the whole admin shell. It also reports the crash to
 * the audit endpoint so we can surface UI regressions without users
 * having to file tickets.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const payload = {
      error: error?.message || String(error),
      stack: error?.stack || null,
      componentStack: errorInfo?.componentStack || null,
      path: typeof window !== 'undefined' ? window.location?.pathname : null,
      ts: new Date().toISOString(),
    };

    // Best-effort fire-and-forget; never throw from componentDidCatch.
    try {
      // eslint-disable-next-line no-console
      console.error('[ui.crash]', payload);
      if (typeof fetch === 'function') {
        fetch('/api/audit/ui-crash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        }).catch(() => {
          /* network is allowed to fail; the console log is the floor */
        });
      }
    } catch {
      /* deliberately empty: audit must not mask the original error */
    }
  }

  handleReload() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            padding: '32px',
            margin: '24px',
            border: '1px solid #b00020',
            borderRadius: 8,
            background: '#fff5f5',
            color: '#1a1a1a',
            maxWidth: 640,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Something broke in this section.</h2>
          <p>The rest of the app is still running. You can retry just this section.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 16px',
              border: '1px solid #1a1a1a',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Reload section
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
