'use client';
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '1rem', padding: '2rem' }}>
          <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            Something went wrong. Please refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '0.5rem 1.25rem', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
