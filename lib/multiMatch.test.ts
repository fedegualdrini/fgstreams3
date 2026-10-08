import { describe, expect, it } from 'vitest';
import type { Match, Stream } from '@/types/api';
import {
  canAddMatch,
  findStreamByValue,
  matchesAvailableToAdd,
  removeActiveMatch,
  selectActiveMatchStream,
  streamOptionValue,
  toggleActiveMatchMuted,
  type ActiveMatch,
} from './multiMatch';

function match(id: string): Match {
  return { id, sport: 'Football', team1: id, team2: 'Rivals', league: '', isLive: false, sources: [] } as unknown as Match;
}

function active(id: string, muted = false): ActiveMatch {
  return { match: match(id), streams: [], selectedStream: null, muted };
}

const streamA: Stream = { url: 'https://a.example/stream', language: 'EN' };
const streamB: Stream = { url: '', embedUrl: 'https://b.example/embed' };

describe('streams', () => {
  it('uses url, then embedUrl, as the option value', () => {
    expect(streamOptionValue(streamA)).toBe('https://a.example/stream');
    expect(streamOptionValue(streamB)).toBe('https://b.example/embed');
    expect(streamOptionValue({ url: '' })).toBe('');
  });

  it('finds a stream by either url', () => {
    expect(findStreamByValue([streamA, streamB], 'https://b.example/embed')).toBe(streamB);
    expect(findStreamByValue([streamA, streamB], 'missing')).toBeUndefined();
  });
});

describe('matchesAvailableToAdd / canAddMatch', () => {
  const wall = [active('1'), active('2')];

  it('excludes matches already on the wall', () => {
    expect(matchesAvailableToAdd([match('1'), match('3')], wall).map((m) => m.id)).toEqual(['3']);
  });

  it('refuses duplicates and a full wall', () => {
    expect(canAddMatch(wall, match('3'), 4)).toBe(true);
    expect(canAddMatch(wall, match('1'), 4)).toBe(false);
    expect(canAddMatch(wall, match('3'), 2)).toBe(false);
  });
});

describe('active match updates', () => {
  const wall = [active('1'), active('2')];

  it('removes by id', () => {
    expect(removeActiveMatch(wall, '1').map((e) => e.match.id)).toEqual(['2']);
  });

  it('toggles mute on one match only', () => {
    const next = toggleActiveMatchMuted(wall, '2');
    expect(next.map((e) => e.muted)).toEqual([false, true]);
    expect(wall[1].muted).toBe(false);
  });

  it('selects a stream on one match only', () => {
    const next = selectActiveMatchStream(wall, '1', streamA);
    expect(next[0].selectedStream).toBe(streamA);
    expect(next[1].selectedStream).toBeNull();
  });
});
