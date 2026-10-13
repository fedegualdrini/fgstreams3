interface MatchActionsProps {
  /** Remounts the player. Omit when there is no single player to reload (multi-stream view, nothing playing). */
  onReloadPlayer?: () => void;
  shareCopied: boolean;
  onShare: () => void;
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  multiStreamMode: boolean;
  onToggleMultiStream: () => void;
}

/** Reload, share, keyboard-shortcut help and multi-stream toggle buttons for the sub-header. */
export default function MatchActions({
  onReloadPlayer,
  shareCopied,
  onShare,
  shortcutsOpen,
  onToggleShortcuts,
  multiStreamMode,
  onToggleMultiStream,
}: MatchActionsProps) {
  return (
    <>
      {onReloadPlayer && (
        <button
          type="button"
          className="btn"
          onClick={onReloadPlayer}
          aria-label="Reload player"
          title="Reload the player. The embed sometimes starts without its quality menu; a reload usually brings it back."
        >
          ↻ Reload
        </button>
      )}
      <button
        type="button"
        className={shareCopied ? 'btn is-copied' : 'btn'}
        onClick={onShare}
        aria-label="Share match"
      >
        {shareCopied ? '✓ Copied' : '⎋ Share'}
      </button>
      <button
        type="button"
        className="btn btn--icon"
        onClick={onToggleShortcuts}
        aria-label="Keyboard shortcuts"
        aria-expanded={shortcutsOpen}
        title="Keyboard shortcuts"
      >
        ?
      </button>
      <button
        type="button"
        className="btn"
        aria-pressed={multiStreamMode}
        onClick={onToggleMultiStream}
      >
        {multiStreamMode ? '▣ Single' : '▤ Multi'}
      </button>
    </>
  );
}
