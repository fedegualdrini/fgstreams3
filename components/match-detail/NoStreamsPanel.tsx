interface NoStreamsPanelProps {
  /** True when sources existed but every one failed, versus none being available yet. */
  allFailed: boolean;
  onRetry: () => void;
}

/** Shown in the player area when there is nothing playable. */
export default function NoStreamsPanel({ allFailed, onRetry }: NoStreamsPanelProps) {
  return (
    <div className="status-panel match-no-streams">
      <div className="match-no-streams__icon" aria-hidden="true">📡</div>
      <p className="status-panel__title">No streams available right now</p>
      <p className="status-panel__message">
        {allFailed
          ? 'All stream sources failed. Try again in a few minutes.'
          : 'No source is carrying this match yet — streams usually appear close to kickoff.'}
      </p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Try Again
      </button>
    </div>
  );
}
