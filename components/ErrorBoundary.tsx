'use client';
import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="status-panel error-boundary">
        <p className="status-panel__message">Something went wrong. Please refresh the page.</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }
}
