import { useState } from 'react';
import type { ChannelOption } from '@/types/channels';

interface OptionPickerProps {
  options: ChannelOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Overlay for switching stream options, anchored to the top of the player
 * because every embed puts its own play/volume/fullscreen bar along the bottom
 * and an overlay there would intercept those clicks.
 *
 * Collapsed to one pill by default — some channels carry twenty-odd mirrors —
 * and dimmed until the pointer is on it. Remount it (via `key`) to collapse it.
 */
export default function OptionPicker({ options, selectedIndex, onSelect }: OptionPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [attended, setAttended] = useState(false);

  const currentOption: ChannelOption | undefined = options[selectedIndex];

  return (
    <div
      className={expanded ? 'option-picker option-picker--expanded' : 'option-picker'}
      onMouseEnter={() => setAttended(true)}
      onMouseLeave={() => setAttended(false)}
    >
      {expanded ? (
        <div className="option-picker__list">
          <button
            type="button"
            className="btn"
            onClick={() => setExpanded(false)}
            aria-label="Hide stream options"
          >
            ✕
          </button>
          {options.map((option, i) => (
            <button
              key={i}
              type="button"
              className="btn"
              aria-pressed={i === selectedIndex}
              onClick={() => { onSelect(i); setExpanded(false); }}
            >
              {option.name}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className={attended ? 'btn option-picker__pill is-attended' : 'btn option-picker__pill'}
          onClick={() => setExpanded(true)}
          aria-label={`Change stream option (${selectedIndex + 1} of ${options.length})`}
          aria-expanded={false}
          onFocus={() => setAttended(true)}
          onBlur={() => setAttended(false)}
        >
          <span className="option-picker__pill-name">
            {currentOption?.name ?? `Opción ${selectedIndex + 1}`}
          </span>
          <span className="option-picker__pill-position">{selectedIndex + 1}/{options.length} ▾</span>
        </button>
      )}
    </div>
  );
}
