// Maps Streamed.pk sport names → flashscore.mobi URL slugs.
// Football uses empty string (root URL: https://www.flashscore.mobi/).
// All other sports use https://www.flashscore.mobi/{slug}/.

export const SPORT_TO_FLASHSCORE_SLUG: Record<string, string> = {
  football: '',
  soccer: '',
  basketball: 'basketball',
  cricket: 'cricket',
  tennis: 'tennis',
  hockey: 'hockey',
  'ice hockey': 'hockey',
  'field hockey': 'field-hockey',
  'american football': 'american-football',
  rugby: 'rugby-union',
  'rugby union': 'rugby-union',
  'rugby league': 'rugby-league',
  baseball: 'baseball',
  handball: 'handball',
  volleyball: 'volleyball',
  mma: 'mma',
  boxing: 'boxing',
  darts: 'darts',
  snooker: 'snooker',
  'table tennis': 'table-tennis',
  futsal: 'futsal',
  badminton: 'badminton',
  'beach volleyball': 'beach-volleyball',
  'beach soccer': 'beach-soccer',
  'aussie rules': 'aussie-rules',
  netball: 'netball',
  floorball: 'floorball',
  bandy: 'bandy',
  'water polo': 'water-polo',
};

export function getFlashscoreUrl(sport: string): string | null {
  const slug = SPORT_TO_FLASHSCORE_SLUG[sport.toLowerCase().trim()];
  if (slug === undefined) return null;
  const base = slug
    ? `https://www.flashscore.mobi/${slug}/`
    : 'https://www.flashscore.mobi/';
  return `${base}?d=0&s=2`;
}
