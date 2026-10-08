import { describe, expect, it } from 'vitest';
import type { Channel } from '@/types/channels';
import {
  clampOptionIndex,
  filterChannelsByName,
  getPlayableOptions,
  pluralize,
  resolveChannelDeepLink,
} from './channelOptions';

const channel = (name: string, urls: string[]): Channel => ({
  name,
  logo: '',
  show: true,
  options: urls.map((iframe, i) => ({ name: `Option ${i + 1}`, iframe })),
});

const espn = channel('ESPN', ['https://a.example/embed', 'javascript:alert(1)', 'http://b.example/live.m3u8']);
const fox = channel('Fox Sports', ['http://plain.example/page']);

describe('getPlayableOptions', () => {
  it('keeps https embeds and http HLS, drops everything else', () => {
    expect(getPlayableOptions(espn).map(o => o.iframe)).toEqual([
      'https://a.example/embed',
      'http://b.example/live.m3u8',
    ]);
    expect(getPlayableOptions(fox)).toEqual([]);
  });
});

describe('filterChannelsByName', () => {
  it('returns everything for a blank query and matches case-insensitively otherwise', () => {
    expect(filterChannelsByName([espn, fox], '  ')).toEqual([espn, fox]);
    expect(filterChannelsByName([espn, fox], 'SPORTS')).toEqual([fox]);
  });
});

describe('clampOptionIndex', () => {
  it('clamps into range and tolerates an empty list', () => {
    expect(clampOptionIndex(5, 3)).toBe(2);
    expect(clampOptionIndex(1, 3)).toBe(1);
    expect(clampOptionIndex(4, 0)).toBe(0);
  });
});

describe('resolveChannelDeepLink', () => {
  it('finds the channel case-insensitively and defaults a bad option to 0', () => {
    expect(resolveChannelDeepLink([espn, fox], 'espn', '1')).toEqual({ channel: espn, optionIndex: 1 });
    expect(resolveChannelDeepLink([espn, fox], 'fox%20sports', 'abc')).toEqual({ channel: fox, optionIndex: 0 });
  });

  it('returns null without a param or a match', () => {
    expect(resolveChannelDeepLink([espn], null, '0')).toBeNull();
    expect(resolveChannelDeepLink([espn], 'nope', '0')).toBeNull();
  });
});

describe('pluralize', () => {
  it('adds an s except for exactly one', () => {
    expect(pluralize(1, 'source')).toBe('1 source');
    expect(pluralize(0, 'source')).toBe('0 sources');
  });
});
