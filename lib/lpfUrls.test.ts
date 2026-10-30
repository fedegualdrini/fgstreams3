import { describe, expect, it } from 'vitest';
import { isLpfCdnUrl } from './lpfUrls';

describe('LPF resolved destination boundary', () => {
  it('accepts both currently observed encoder hosts', () => {
    expect(isLpfCdnUrl('https://liveassets-b.encoders.immergo.tv/lpf/current/master.m3u8')).toBe(true);
    expect(isLpfCdnUrl('https://liveassets-uvod-live-encoder-assets-1-static-2.encoders.immergo.tv/game/1/streamPlaylist-live.m3u8')).toBe(true);
  });

  it.each([
    'https://encoders.immergo.tv.evil.example/game.m3u8',
    'https://evilencoders.immergo.tv/game.m3u8',
    'http://liveassets-b.encoders.immergo.tv/game.m3u8',
    'https://user:password@liveassets-b.encoders.immergo.tv/game.m3u8',
    'https://liveassets-b.encoders.immergo.tv:8080/game.m3u8',
    'https://liveassets-b.encoders.immergo.tv/game.html',
    'https://127.0.0.1/game.m3u8',
  ])('rejects destinations outside the HTTPS encoder-playlist boundary: %s', url => {
    expect(isLpfCdnUrl(url)).toBe(false);
  });
});
