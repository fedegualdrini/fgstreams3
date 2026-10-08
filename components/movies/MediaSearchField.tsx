interface MediaSearchFieldProps {
  value: string;
  placeholder: string;
  loading: boolean;
  onChange: (value: string) => void;
}

export default function MediaSearchField({ value, placeholder, loading, onChange }: MediaSearchFieldProps) {
  return (
    <div className="search-field search-field--wide">
      <span className="search-field__icon">
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>
      <input
        type="text"
        className="search-field__input"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {loading && <span className="search-field__busy">…</span>}
    </div>
  );
}
