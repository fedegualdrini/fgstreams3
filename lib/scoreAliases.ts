// Maps common Streamed.pk team name variants → canonical search tokens.
// All keys and values should be lowercase.
export const TEAM_ALIASES: Record<string, string> = {
  // Football
  'man united': 'manchester united',
  'man utd': 'manchester united',
  'man city': 'manchester city',
  'psg': 'paris saint-germain',
  'paris sg': 'paris saint-germain',
  'spurs': 'tottenham',
  'tottenham hotspur': 'tottenham',
  'barca': 'barcelona',
  'real': 'real madrid',
  'atletico': 'atletico madrid',
  'atleti': 'atletico madrid',
  'inter': 'inter milan',
  'wolves': 'wolverhampton',
  'wolverhampton wanderers': 'wolverhampton',
  'leeds united': 'leeds',
  'west brom': 'west bromwich',
  'west bromwich albion': 'west bromwich',
  'brighton': 'brighton hove albion',
  'brighton & hove albion': 'brighton hove albion',
  'sheffield united': 'sheffield utd',
  'sheffield wednesday': 'sheffield wed',
  'nottm forest': 'nottingham forest',
  'nottingham forest': 'nottingham forest',
  // Basketball
  'la lakers': 'los angeles lakers',
  'la clippers': 'los angeles clippers',
  'golden state': 'golden state warriors',
  'new york': 'new york knicks',
  // Add more as encountered in the wild
};
