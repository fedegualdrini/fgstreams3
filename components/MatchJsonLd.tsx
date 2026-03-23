import type { Match } from '@/types/api';
import { getPosterUrl } from '@/lib/api';

export default function MatchJsonLd({ match }: { match: Match }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${match.team1} vs ${match.team2}`,
    sport: match.sport,
    description: `${match.league} match between ${match.team1} and ${match.team2}`,
    ...(match.startTime && { startDate: match.startTime }),
    ...(match.poster && { image: getPosterUrl(match.poster) }),
    homeTeam: { '@type': 'SportsTeam', name: match.team1 },
    awayTeam: { '@type': 'SportsTeam', name: match.team2 },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
