import { describe, it, expect } from 'vitest';
import { extractPathToken, tokenPathClaim, tokenCoversMedia } from './libProbe.mjs';

// A `tok_<jwt>` whose payload claims the directory "/live/ch/dash_cenc/".
const payload = Buffer.from(JSON.stringify({ path: '/live/ch/dash_cenc/' })).toString('base64url');
const TOKEN = `header.${payload}.signature`;

describe('extractPathToken', () => {
  it('reads the token out of a redirected url', () => {
    expect(extractPathToken(`https://edge.example/tok_${TOKEN}/live/ch/x.mpd`)).toBe(TOKEN);
    expect(extractPathToken('https://edge.example/live/ch/x.mpd')).toBeNull();
  });
});

describe('tokenPathClaim', () => {
  it('decodes the directory the token is scoped to', () => {
    expect(tokenPathClaim(TOKEN)).toBe('/live/ch/dash_cenc/');
    expect(tokenPathClaim('not-a-jwt')).toBeNull();
  });
});

describe('tokenCoversMedia', () => {
  it('accepts a token scoped to the directory the stream plays from', () => {
    expect(tokenCoversMedia(TOKEN, 'https://edge.example/tok_x/live/ch/dash_cenc/s.mpd')).toBe(true);
  });

  it('rejects one scoped to a different directory than the media', () => {
    expect(tokenCoversMedia(TOKEN, 'https://edge.example/tok_x/live/ch/dash_enc/s.mpd')).toBe(false);
  });
});
