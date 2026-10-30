import { memo } from 'react';

const SPORT_ICONS: Record<string, string> = {
  all: '🏆',
  soccer: '⚽',
  basketball: '🏀',
  tennis: '🎾',
  combat: '🥊',
  racing: '🏎️',
};

interface MatchToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  sports: string[];
  sport: string;
  onSportChange: (sport: string) => void;
}

function MatchToolbar({ query, onQueryChange, sports, sport, onSportChange }: MatchToolbarProps) {
  return (
    <div className="match-toolbar">
      <div className="search-field">
        <span className="search-field__icon" aria-hidden="true">⌕</span>
        <input
          id="match-search"
          className="search-field__input"
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
              <span>{label.toLowerCase() === 'football' ? 'American Football' : label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(MatchToolbar);
