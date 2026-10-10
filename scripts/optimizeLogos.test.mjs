import { describe, it, expect } from 'vitest';
import {
  logoFileName,
  distinctRemoteLogos,
  rewriteLogos,
  serializeLike,
  classifyFailure,
  sourceUrls,
} from './optimize-logos.mjs';

const URL_A = 'https://cdn.example.com/a.png';
const URL_B = 'http://other.example.org/b.jpg';

describe('logoFileName', () => {
  it('is stable and a 12-hex-char webp name', () => {
    expect(logoFileName(URL_A)).toBe(logoFileName(URL_A));
    expect(logoFileName(URL_A)).toMatch(/^[0-9a-f]{12}\.webp$/);
  });

  it('differs for URLs that only differ in query string, scheme or case', () => {
    const names = [
      URL_A,
      `${URL_A}?v=2`,
      URL_A.replace('https', 'http'),
      URL_A.replace('a.png', 'A.png'),
    ].map(logoFileName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('distinctRemoteLogos', () => {
  it('lists each remote URL once and ignores local paths and non-strings', () => {
    const channels = [
      { name: 'x', logo: URL_A },
      { name: 'y', logo: URL_A },
      { name: 'z', logo: URL_B },
      { name: 'l', logo: '/logos/abc.webp' },
      { name: 'n' },
    ];
    expect(distinctRemoteLogos(channels)).toEqual([URL_A, URL_B]);
  });
});

describe('rewriteLogos', () => {
  const channels = [
    { name: 'ok', logo: URL_A, options: [{ name: 'o' }] },
    { name: 'dead', logo: URL_B },
    { name: 'local', logo: '/images/x.png' },
    { name: 'none' },
  ];
  const resolved = new Map([[URL_A, '/logos/aaaaaaaaaaaa.webp']]);
  const out = rewriteLogos(channels, resolved);

  it('rewrites only remote logos that resolved', () => {
    expect(out[0]).toEqual({ name: 'ok', logo: '/logos/aaaaaaaaaaaa.webp', options: [{ name: 'o' }] });
  });

  it('keeps the remote URL of failures and leaves local or missing logos alone', () => {
    expect(out[1].logo).toBe(URL_B);
    expect(out[2].logo).toBe('/images/x.png');
    expect(out[3]).toEqual({ name: 'none' });
  });

  it('does not mutate its input', () => {
    expect(channels[0].logo).toBe(URL_A);
  });

  it('blanks a logo whose resolved path is empty, i.e. gone for good', () => {
    const gone = new Map([[URL_B, '']]);
    expect(rewriteLogos(channels, gone)[1].logo).toBe('');
  });

  it('never rewrites a local path even if it appears in the map', () => {
    const odd = new Map([['/images/x.png', '/logos/zzz.webp']]);
    expect(rewriteLogos(channels, odd)[2].logo).toBe('/images/x.png');
  });
});

describe('serializeLike', () => {
  const data = [{ name: 'a', logo: '/l.webp' }];

  it('keeps CRLF line endings and the trailing newline', () => {
    const original = '[\r\n  {\r\n    "name": "a",\r\n    "logo": "http://x/l.png"\r\n  }\r\n]\r\n';
    expect(serializeLike(original, data)).toBe(
      '[\r\n  {\r\n    "name": "a",\r\n    "logo": "/l.webp"\r\n  }\r\n]\r\n'
    );
  });

  it('keeps LF files LF and does not invent a trailing newline', () => {
    const out = serializeLike('[]', data);
    expect(out).not.toContain('\r');
    expect(out.endsWith(']')).toBe(true);
  });
});

describe('classifyFailure', () => {
  it.each([400, 404, 410])('treats HTTP %i as permanent', status => {
    expect(classifyFailure({ status })).toBe('permanent');
  });

  it('treats a nonexistent domain as permanent', () => {
    expect(classifyFailure({ cause: { code: 'ENOTFOUND' } })).toBe('permanent');
  });

  it.each([403, 429, 500, 503])('treats HTTP %i as transient', status => {
    expect(classifyFailure({ status })).toBe('transient');
  });

  it.each(['ECONNRESET', 'EAI_AGAIN', 'UND_ERR_SOCKET'])('treats %s as transient', code => {
    expect(classifyFailure({ cause: { code } })).toBe('transient');
  });

  it('treats timeouts and unknown errors as transient', () => {
    expect(classifyFailure({ name: 'TimeoutError' })).toBe('transient');
    expect(classifyFailure(new Error('Input buffer contains unsupported image format'))).toBe('transient');
  });
});

describe('sourceUrls', () => {
  it('tries https before the original for an http logo', () => {
    expect(sourceUrls('http://cdn.example.com/a.png?v=1')).toEqual([
      'https://cdn.example.com/a.png?v=1',
      'http://cdn.example.com/a.png?v=1',
    ]);
  });

  it('uses an https logo as is', () => {
    expect(sourceUrls(URL_A)).toEqual([URL_A]);
  });

  it('does not change the file name, which is derived from the original URL', () => {
    expect(logoFileName('http://cdn.example.com/a.png')).not.toBe(
      logoFileName('https://cdn.example.com/a.png')
    );
  });
});
