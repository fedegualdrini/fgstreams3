import Spinner from '@/components/Spinner';

export function LoadingOverlay({ seconds }: { seconds: number }) {
  return (
    <div className="player-overlay player-overlay--loading">
      <Spinner label={`Connecting to stream… (${seconds}s)`} />
    </div>
  );
}

interface TimeoutOverlayProps {
  canTryNext: boolean;
  onTryNext: () => void;
  onRetry: () => void;
}

export function TimeoutOverlay({ canTryNext, onTryNext, onRetry }: TimeoutOverlayProps) {
  return (
    <div className="player-overlay player-overlay--error">
      <p className="player-overlay__title">Stream not responding</p>
      <p className="player-overlay__hint">Try a different option</p>
      <div className="player-overlay__actions">
        {canTryNext && (
          <button type="button" className="btn btn--primary" onClick={onTryNext}>Try next</button>
        )}
        <button type="button" className="btn" onClick={onRetry}>Retry</button>
      </div>
    </div>
  );
}
