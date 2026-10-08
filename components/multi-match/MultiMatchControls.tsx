import type { MatchLayout } from '@/lib/multiMatch';

interface MultiMatchControlsProps {
  layout: MatchLayout;
  onLayoutChange: (layout: MatchLayout) => void;
  count: number;
  maxMatches: number;
  onAdd: () => void;
  onClearExtras: () => void;
}

export default function MultiMatchControls({
  layout, onLayoutChange, count, maxMatches, onAdd, onClearExtras,
}: MultiMatchControlsProps) {
  const isFull = count >= maxMatches;

  return (
    <div className="multi-controls">
      <label className="multi-label" htmlFor="multi-layout">Layout</label>
      <select
        id="multi-layout"
        className="multi-select"
        value={layout}
        onChange={(event) => onLayoutChange(event.target.value as MatchLayout)}
      >
        <option value="grid">Grid</option>
        <option value="side-by-side">Side by side</option>
      </select>

      <span className="multi-label multi-controls__count">{count} / {maxMatches}</span>

      <button type="button" className={`btn${isFull ? '' : ' is-active'}`} onClick={onAdd} disabled={isFull}>
        + Add match
      </button>

      {count > 1 && (
        <button type="button" className="btn multi-clear" onClick={onClearExtras}>
          Clear all
        </button>
      )}
    </div>
  );
}
