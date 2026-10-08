const OPTIONS = [
  { type: 'movie', label: 'Movies' },
  { type: 'tv', label: 'TV Series' },
] as const;

interface MediaTypeToggleProps {
  value: 'movie' | 'tv';
  onChange: (type: 'movie' | 'tv') => void;
}

export default function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  return (
    <div className="media-toggle">
      {OPTIONS.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          className="btn"
          aria-pressed={value === type}
          onClick={() => onChange(type)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
