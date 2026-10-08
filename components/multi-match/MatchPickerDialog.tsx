import type { Match } from '@/types/api';
import MatchHeading from './MatchHeading';
import { IconClose } from './icons';
import { useDialogEscape } from './useDialogEscape';

interface MatchPickerDialogProps {
  matches: Match[];
  onPick: (match: Match) => void;
  onClose: () => void;
}

export default function MatchPickerDialog({ matches, onPick, onClose }: MatchPickerDialogProps) {
  const dialogRef = useDialogEscape<HTMLDivElement>(onClose);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select match to add"
      className="multi-dialog-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} tabIndex={-1} className="multi-dialog">
        <div className="multi-dialog__header">
          <h3 className="multi-dialog__title">Add a match</h3>
          <button type="button" className="multi-icon-btn multi-icon-btn--ghost" onClick={onClose} aria-label="Close">
            <IconClose size={14} />
          </button>
        </div>

        <div className="multi-dialog__list">
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              className="multi-dialog__option"
              onClick={() => onPick(match)}
            >
              <MatchHeading match={match} />
            </button>
          ))}
          {matches.length === 0 && (
            <p className="multi-label multi-dialog__empty">No more matches available</p>
          )}
        </div>
      </div>
    </div>
  );
}
