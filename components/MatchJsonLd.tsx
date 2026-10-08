import type { Match } from '@/types/api';
import { getPosterUrl } from '@/lib/api';

const UNSAFE_CHAR_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  "'": '\\u0027',
  '"': '\\u0022',
};

// Strip HTML tags and escape characters that could break a <script> tag when embedded as JSON.
function sanitizeText(str: string): string {
  return str.replace(/<[^>]*>/g, '').replace(/[<>&'"]/g, (c) => UNSAFE_CHAR_ESCAPES[c]);
}

export default function MatchJsonLd({ match }: { match: Match }) {
  const team1 = sanitizeText(match.team1);
  const team2 = sanitizeText(match.team2);
  const league = sanitizeText(match.league);
  const sport = sanitizeText(match.sport);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${team1} vs ${team2}`,
    sport,
    description: `${league} match between ${team1} and ${team2}`,
    ...(match.startTime && { startDate: match.startTime }),
    ...(match.poster && { image: getPosterUrl(match.poster) }),
    homeTeam: { '@type': 'SportsTeam', name: team1 },
    awayTeam: { '@type': 'SportsTeam', name: team2 },
  };

  // JSON.stringify produces valid JSON; the sanitizeText calls above prevent
  // any </script> injection from user-controlled team/league names.
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
