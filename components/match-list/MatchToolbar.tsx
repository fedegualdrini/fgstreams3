const SPORT_ICONS: Record<string, string> = {
  all: '🏆',
  football: '⚽',
  basketball: '🏀',
  tennis: '🎾',
  mma: '🥊',
  'formula 1': '🏎️',
};

interface MatchToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  sports: string[];
  sport: string;
  onSportChange: (sport: string) => void;
}

export default function MatchToolbar({ query, onQueryChange, sports, sport, onSportChange }: MatchToolbarProps) {
  return (
    <div className="match-toolbar">
      <div className="match-search">
        <span className="match-search__icon" aria-hidden="true">⌕</span>
        <input
          id="match-search"
          className="match-search__input"
          type="text"
          placeholder="Search teams, leagues…"
          autoComplete="off"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="sport-filters">
        {sports.map((label) => {
          const icon = SPORT_ICONS[label.toLowerCase()];
          return (
            <button
              key={label}
              type="button"
              className="btn sport-chip"
              aria-pressed={sport === label}
              onClick={() => onSportChange(label)}
            >
              {icon && <span>{icon}</span>}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
