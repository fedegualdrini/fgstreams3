import { describe, it, expect } from 'vitest';
import { generateMatchId, matchStartMs, normalizeMatches } from './matchUtils';
import { currentLiveState, isListable } from './catalogWindow';
import { STREAMFREE_SOURCE } from './streamfree';
import type { RawMatch } from '@/types/api';

describe('generateMatchId', () => {
  it('returns existing id when present', () => {
    expect(generateMatchId({ id: 'abc123' })).toBe('abc123');
  });

  it('generates a deterministic id from match fields', () => {
    const match = { sport: 'football', league: 'Premier League', team1: 'Arsenal', team2: 'Chelsea', startTime: '2025-01-01T15:00:00Z' };
    const id1 = generateMatchId(match);
    const id2 = generateMatchId(match);
    expect(id1).toBe(id2);
  });

  it('generates different ids for different matches', () => {
    const a = generateMatchId({ sport: 'football', team1: 'Arsenal', team2: 'Chelsea' });
    const b = generateMatchId({ sport: 'football', team1: 'Liverpool', team2: 'Everton' });
    expect(a).not.toBe(b);
  });

});

describe('normalizeMatches', () => {
  const now = Date.parse('2026-10-29T18:00:00Z');
  const liveUrl = 'https://strmfree.st/embed/soccer/arsenal-chelsea1080p';
  const base: RawMatch = {
    id: 'unrelated-api-uuid',
    stream_key: 'arsenal-chelsea',
    name: 'Arsenal vs Chelsea',
    category: 'soccer',
    league: 'Premier League',
    sources: [{ quality: 'FHD', url: liveUrl }],
    live_sources: [],
  };

  it('uses the stream key as its stable ID and carries inline source variants', () => {
    const raw = { ...base, live_sources: [{ quality: 'FHD', url: liveUrl }] };
    const [match] = normalizeMatches([raw]);
    expect(match.id).toBe(base.stream_key);
    expect(match.sport).toBe('soccer');
    expect(match.league).toBe('Premier League');
    expect(match.sources).toEqual([{
      source: STREAMFREE_SOURCE,
      id: base.stream_key,
      streams: [{ url: liveUrl, embedUrl: liveUrl, source: STREAMFREE_SOURCE, isLive: true, quality: '1080p' }],
    }]);
    expect(match.isLive).toBe(true);
  });

  it('prefers structured team names and preserves exact image URLs', () => {
    const raw: RawMatch = {
      ...base,
      team1: { name: 'Arsenal FC', logo: 'https://images.example/home.png?size=80' },
      team2: { name: 'Chelsea FC', logo: 'https://images.example/away.svg' },
      thumbnail_url: 'https://streamfree.top/thumbnails/match.jpg',
    };
    const [match] = normalizeMatches([raw]);
    expect(match.team1).toBe('Arsenal FC');
    expect(match.team2).toBe('Chelsea FC');
    expect(match.image1).toBe(raw.team1?.logo);
    expect(match.image2).toBe(raw.team2?.logo);
    expect(match.poster).toBe(raw.thumbnail_url);
  });

  it.each(['Liverpool - Everton', 'Liverpool vs Everton', 'Liverpool vs. Everton'])(
    'parses absent structured names from %s',
    name => {
      const [match] = normalizeMatches([{ ...base, name }]);
      expect(match.team1).toBe('Liverpool');
      expect(match.team2).toBe('Everton');
    },
  );

  it('falls back independently for missing structured names', () => {
    const [match] = normalizeMatches([{
      ...base,
      team1: { name: 'Arsenal FC' },
      team2: { name: '' },
    }]);
    expect(match.team1).toBe('Arsenal FC');
    expect(match.team2).toBe('Chelsea');
  });

  it('keeps a channel name as team1 without inventing an opponent or images', () => {
    const [match] = normalizeMatches([{
      ...base, name: 'Sky Sports F1', team1: null, team2: null, thumbnail_url: null,
    }]);
    expect(match.team1).toBe('Sky Sports F1');
    expect(match.team2).toBe('');
    expect(match.image1).toBeUndefined();
    expect(match.image2).toBeUndefined();
    expect(match.poster).toBeUndefined();
  });

  it('converts Unix seconds to an ISO kickoff', () => {
    const [match] = normalizeMatches([{ ...base, match_timestamp: now / 1000 }]);
    expect(match.startTime).toBe('2026-10-29T18:00:00.000Z');
    expect(matchStartMs(match, now)).toBe(now);
  });

  it.each([undefined, null, 0, NaN, Infinity, 1e20])(
    'leaves absent or invalid kickoff %s undefined without throwing',
    match_timestamp => {
      const [match] = normalizeMatches([{ ...base, match_timestamp }]);
      expect(match.startTime).toBeUndefined();
    },
  );

  it.each([-120, -0.5, 24])(
    'does not infer liveness from a kickoff offset of %s hours',
    offsetHours => {
      const [match] = normalizeMatches([{
        ...base, match_timestamp: now / 1000 + offsetHours * 3600,
      }]);
      expect(match.isLive).toBe(false);
      expect(currentLiveState(match)).toBe(false);
    },
  );

  it.each([-120 * 24, 120 * 24])(
    'keeps live streams listed with kickoff offset of %s hours',
    offsetHours => {
      const [match] = normalizeMatches([{
        ...base,
        name: 'Sky Sports F1',
        match_timestamp: now / 1000 + offsetHours * 3600,
        live_sources: [{ quality: 'FHD', url: liveUrl }],
      }]);
      expect(currentLiveState(match)).toBe(true);
      expect(isListable(match, now)).toBe(true);
    },
  );

  it('preserves kickoff windows and required names for listing', () => {
    const [old, future, recent, unnamed] = normalizeMatches([
      { ...base, match_timestamp: now / 1000 - 120 * 3600 },
      { ...base, match_timestamp: now / 1000 + 120 * 3600 },
      { ...base, match_timestamp: now / 1000 - 1800 },
      { ...base, name: '', live_sources: [{ quality: 'FHD', url: liveUrl }] },
    ]);
    expect(isListable(old, now)).toBe(false);
    expect(isListable(future, now)).toBe(false);
    expect(isListable(recent, now)).toBe(true);
    expect(isListable(unnamed, now)).toBe(false);
  });

  it('defaults an absent league to empty and returns empty input unchanged', () => {
    expect(normalizeMatches([{ ...base, league: null }])[0].league).toBe('');
    expect(normalizeMatches([])).toEqual([]);
  });
});
