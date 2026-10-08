interface MatchActionsProps {
  shareCopied: boolean;
  onShare: () => void;
  shortcutsOpen: boolean;
  onToggleShortcuts: () => void;
  multiStreamMode: boolean;
  onToggleMultiStream: () => void;
}

/** Share, keyboard-shortcut help and multi-stream toggle buttons for the sub-header. */
export default function MatchActions({
  shareCopied,
  onShare,
  shortcutsOpen,
  onToggleShortcuts,
  multiStreamMode,
  onToggleMultiStream,
}: MatchActionsProps) {
  return (
    <>
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
