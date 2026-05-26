import React from 'react';

// Best-effort import of the existing audit helper. If the kiosk is mid-
// crash and the module graph is broken, fall back to a raw fetch.
let auditFn = null;
try {
  // eslint-disable-next-line global-require, import/no-unresolved
  auditFn = require('@/app/api/audit').audit;
} catch {
  auditFn = null;
}

/**
 * Forensic audit: zero error boundaries across all three SPAs.
 *
 * Catches render-time + lifecycle errors below it and renders a small
 * "Reload section" fallback so a single broken page doesn't blank the
 * whole kiosk shell — important because the kiosk is locked down and a
 * full white screen leaves the customer with no recourse.
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

    try {
      // eslint-disable-next-line no-console
      console.error('[ui.crash]', payload);
      if (typeof auditFn === 'function') {
        auditFn('ui.crash', payload);
      } else if (typeof fetch === 'function') {
        fetch('/api/audit/ui-crash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        }).catch(() => {
          /* allowed to fail; the console log is the floor */
        });
      }
    } catch {
      /* audit must not mask the original render error */
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
            padding: 24,
            margin: 16,
            border: '1px solid #b00020',
            borderRadius: 8,
            background: '#0b0f14',
            color: '#fafafa',
            maxWidth: 640,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Something broke in this section.</h2>
          <p>The rest of the kiosk is still running. You can retry this view.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>
            {this.state.error?.message || 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 16px',
              border: '1px solid #3ABEFF',
              borderRadius: 4,
              background: 'transparent',
              color: '#3ABEFF',
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
