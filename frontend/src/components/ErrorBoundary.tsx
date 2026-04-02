import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0d1117',
            color: '#c9d1d9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
            zIndex: 99999,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e6edf3', marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 20, lineHeight: 1.5 }}>
              The app ran into an unexpected error. Your work has been auto-saved.
              Try reloading the page to continue where you left off.
            </div>
            <div style={{ fontSize: 11, color: '#484f58', marginBottom: 20, fontFamily: 'monospace' }}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: '#238636',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
              <button
                onClick={this.handleDismiss}
                style={{
                  background: 'rgba(48,54,61,0.7)',
                  color: '#c9d1d9',
                  border: '1px solid rgba(48,54,61,0.7)',
                  borderRadius: 6,
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try to Continue
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
