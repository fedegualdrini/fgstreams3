interface ErrorPanelProps {
  title: string;
  /** Shown when the thrown error carries no message of its own. */
  fallbackMessage: string;
  error: Error;
  onRetry: () => void;
}

/** Shared body for route-level `error.tsx` boundaries. */
export default function ErrorPanel({ title, fallbackMessage, error, onRetry }: ErrorPanelProps) {
  return (
    <div className="status-panel" style={{ minHeight: '50vh' }} role="alert">
      <p className="status-panel__title">{title}</p>
      <p className="status-panel__message">{error.message || fallbackMessage}</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
