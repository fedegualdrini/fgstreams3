import type { FlashscoreLineups, FlashscorePlayer } from '@/types/api';

export default function StatsLineups({ lineups }: { lineups: FlashscoreLineups }) {
  const hasSubs = lineups.homeSubs.length > 0 || lineups.awaySubs.length > 0;

  return (
    <div>
      <div className="lineups__columns lineups__teams">
        <span className="lineups__team">{lineups.homeTeam}</span>
        <span className="lineups__team lineups__team--away">{lineups.awayTeam}</span>
      </div>
      <div className="lineups__columns">
        <PlayerList players={lineups.homePlayers} align="left" />
        <PlayerList players={lineups.awayPlayers} align="right" />
      </div>
      {hasSubs && (
        <>
          <div className="lineups__subs-heading">
            <span className="lineups__subs-label">Substitutes</span>
          </div>
          <div className="lineups__columns">
            <PlayerList players={lineups.homeSubs} align="left" />
            <PlayerList players={lineups.awaySubs} align="right" />
          </div>
        </>
      )}
    </div>
  );
}

function PlayerList({ players, align }: { players: FlashscorePlayer[]; align: 'left' | 'right' }) {
  const playerClass = align === 'right' ? 'lineup-player lineup-player--right' : 'lineup-player';

  return (
    <div className="lineup-list">
      {players.map((p, i) => (
        <div key={i} className={playerClass}>
          {p.number && <span className="lineup-player__number">{p.number}</span>}
          <span className="lineup-player__name">{p.name}</span>
        </div>
      ))}
    </div>
  );
}
