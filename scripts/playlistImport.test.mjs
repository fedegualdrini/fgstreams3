import { describe, it, expect } from 'vitest';
import {
  decodeMojibake,
  normalizeName,
  flattenPlaylist,
  parseClearKeys,
  classifyRow,
  mergePlaylist,
  proxyHostsFrom,
} from './playlistImport.mjs';

const hlsProbe = { status: 200, cors: '*', isM3u: true, isMpd: false };
const mpdProbe = { status: 200, cors: '*', isM3u: false, isMpd: true };

describe('decodeMojibake', () => {
  it('restores UTF-8 that was decoded as CP1252', () => {
    expect(decodeMojibake('Lista Canales globales âš½')).toBe('Lista Canales globales ⚽');
  });

  it('leaves already-correct text alone', () => {
    expect(decodeMojibake('Canales de España')).toBe('Canales de España');
  });
});

describe('normalizeName', () => {
  it('ignores quality tags, flags and accents', () => {
    expect(normalizeName('TNT Sports HD 🇦🇷')).toBe(normalizeName('TNT Sports'));
    expect(normalizeName('DSports FULL HD')).toBe('dsports');
    expect(normalizeName('Canción')).toBe('cancion');
  });

  it('keeps numbered channels apart', () => {
    expect(normalizeName('ESPN 2')).not.toBe(normalizeName('ESPN 3'));
  });
});

describe('flattenPlaylist', () => {
  it('expands stations with and without options', () => {
    const rows = flattenPlaylist({
      groups: [{
        name: 'Deportes',
        stations: [
          { name: 'DSports', image: 'logo.png', options: [{ name: 'HD', url: 'https://a/x.m3u8' }] },
          { name: 'TyC', url: 'https://b/y.m3u8', image: 'tyc.png' },
        ],
      }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ station: 'DSports', option: 'HD', logo: 'logo.png' });
    expect(rows[1]).toMatchObject({ station: 'TyC', option: 'TyC', url: 'https://b/y.m3u8' });
  });
});

describe('parseClearKeys', () => {
  it('converts an EME JWK set to hex pairs', () => {
    const jwk = '{"keys":[{"kty":"oct","kid":"RbvVgvIg9Dj4lkUNgwaj8g","k":"WCxrp/ZLvA8tkcawwmV2DA"}],"type":"temporary"}';
    expect(parseClearKeys(jwk)).toEqual({
      '45bbd582f220f438f896450d8306a3f2': '582c6ba7f64bbc0f2d91c6b0c265760c',
    });
  });

  it('rejects licence URLs and malformed payloads', () => {
    expect(parseClearKeys('https://example.com/key')).toBeNull();
    expect(parseClearKeys('{"keys":[]}')).toBeNull();
  });
});

describe('classifyRow', () => {
  it('keeps a reachable HLS manifest and proxies it when CORS is missing', () => {
    const row = { url: 'https://a/x.m3u8', licenseType: '' };
    expect(classifyRow(row, hlsProbe)).toEqual({ kind: 'hls', proxy: false });
    expect(classifyRow(row, { ...hlsProbe, cors: '' })).toEqual({ kind: 'hls', proxy: true });
  });

  it('proxies plain-http manifests even when they send CORS', () => {
    expect(classifyRow({ url: 'http://1.2.3.4/x.m3u8', licenseType: '' }, hlsProbe))
      .toEqual({ kind: 'hls', proxy: true });
  });

  it('drops manifests that could not be fetched', () => {
    expect(classifyRow({ url: 'https://a/x.m3u8', licenseType: '' }, { status: 0, cors: '', isM3u: false }))
      .toEqual({ kind: null, reason: 'hls-unreachable' });
  });

  it('accepts ClearKey DASH and refuses the DRM it cannot decrypt', () => {
    const jwk = '{"keys":[{"kty":"oct","kid":"RbvVgvIg9Dj4lkUNgwaj8g","k":"WCxrp/ZLvA8tkcawwmV2DA"}]}';
    const verdict = classifyRow({ url: 'https://a/m.mpd', licenseType: 'clearkey', licenseKey: jwk }, mpdProbe);
    expect(verdict.kind).toBe('dash');
    expect(verdict.clearKeys).toHaveProperty('45bbd582f220f438f896450d8306a3f2');

    expect(classifyRow({ url: 'https://a/m.mpd', licenseType: 'widevine' }, mpdProbe))
      .toEqual({ kind: null, reason: 'unsupported-drm' });
  });

  it('rejects DASH the browser could not fetch cross-origin', () => {
    expect(classifyRow({ url: 'https://a/m.mpd', licenseType: 'clearkey' }, { ...mpdProbe, cors: '' }))
      .toEqual({ kind: null, reason: 'dash-no-cors' });
  });

  it('treats other https links as embed pages and drops the rest', () => {
    expect(classifyRow({ url: 'https://embed.example/player/1', licenseType: '' }))
      .toEqual({ kind: 'iframe', proxy: false });
    expect(classifyRow({ url: 'https://radio.example/stream.aac', licenseType: '' }).kind).toBeNull();
    expect(classifyRow({ url: 'http://1.2.3.4:8000/udp/224.0.0.4', licenseType: '' }).kind).toBeNull();
    expect(classifyRow({ url: 'https://linktr.ee/list', licenseType: 'website' }).kind).toBeNull();
  });
});

describe('mergePlaylist', () => {
  const existing = [
    { name: 'DSports', logo: 'd.png', options: [{ name: 'Op 1', iframe: 'https://old/1' }], show: true },
  ];

  it('appends to the matching channel and creates the rest', () => {
    const rows = [
      { station: 'DSports HD', option: 'Op 2', url: 'https://a/x.m3u8', logo: '', licenseType: '' },
      { station: 'Nuevo Canal', option: 'Op 1', url: 'https://embed.example/p', logo: 'n.png', licenseType: '' },
    ];
    const { channels, stats } = mergePlaylist(existing, rows, new Map([['https://a/x.m3u8', hlsProbe]]));

    expect(stats).toMatchObject({ added: 2, newChannels: 1, duplicates: 0 });
    expect(channels[0].options).toHaveLength(2);
    expect(channels[1]).toMatchObject({ name: 'Nuevo Canal', show: true, source: 'playlist' });
  });

  it('never duplicates a url that is already in the list', () => {
    const rows = [{ station: 'DSports', option: 'Op 1 again', url: 'https://old/1', logo: '', licenseType: '' }];
    const { channels, stats } = mergePlaylist(existing, rows);
    expect(stats.duplicates).toBe(1);
    expect(channels[0].options).toHaveLength(1);
  });

  it('leaves the input untouched', () => {
    const rows = [{ station: 'DSports', option: 'Op 2', url: 'https://a/x.m3u8', logo: '', licenseType: '' }];
    mergePlaylist(existing, rows, new Map([['https://a/x.m3u8', hlsProbe]]));
    expect(existing[0].options).toHaveLength(1);
  });

  it('disambiguates option names that repeat inside one channel', () => {
    const rows = [
      { station: 'DSports', option: 'Op 1', url: 'https://a/x.m3u8', logo: '', licenseType: '' },
    ];
    const { channels } = mergePlaylist(existing, rows, new Map([['https://a/x.m3u8', hlsProbe]]));
    expect(channels[0].options.map(o => o.name)).toEqual(['Op 1', 'Op 1 (2)']);
  });
});

describe('proxyHostsFrom', () => {
  it('lists only the origins the proxy actually has to reach', () => {
    const channels = [{
      name: 'X', logo: '', show: true, options: [
        { name: 'a', iframe: 'https://direct.example/x.m3u8' },
        { name: 'b', iframe: 'https://needsproxy.example/x.m3u8', proxy: true },
        { name: 'c', iframe: 'http://1.2.3.4/x.m3u8' },
      ],
    }];
    expect(proxyHostsFrom(channels)).toEqual(['1.2.3.4', 'needsproxy.example']);
  });
});
