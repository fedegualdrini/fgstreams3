'use client';

export default function MatchError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="status-panel match-error" role="alert">
      <p className="status-panel__title">Failed to load match</p>
      <p className="status-panel__message">
        {error.message || 'Could not load match details. The match may no longer be available.'}
      </p>
      <div className="match-error__actions">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <a href="/" className="btn">
          Back to matches
        </a>
      </div>
    </div>
  );
}
