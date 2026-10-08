import { SHORTCUTS } from './shortcuts';

/** Modal listing every keyboard shortcut; closes on backdrop click. */
export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="shortcuts-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="shortcuts-dialog">
        <div className="shortcuts-dialog__title">Keyboard Shortcuts</div>
        {SHORTCUTS.map(({ id, label, description }) => (
          <div key={id} className="shortcuts-dialog__row">
            <kbd className="kbd">{label}</kbd>
            <span className="shortcuts-dialog__desc">{description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
