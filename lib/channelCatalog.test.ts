import { describe, it, expect } from 'vitest';
import { mergeChannelCatalogs } from './channelCatalog';
import type { Channel } from '@/types/channels';

const channel = (name: string, urls: string[], logo = 'local.png'): Channel => ({
  name,
  logo,
  show: true,
  options: urls.map((iframe, i) => ({ name: `Opción ${i + 1}`, iframe })),
});

describe('mergeChannelCatalogs', () => {
  const base = [
    channel('ESPN Premium', ['https://old.example/a', 'https://old.example/b']),
    channel('Canales de UK', ['https://old.example/uk']),
  ];

  it('puts live options first and keeps ours behind them', () => {
    const merged = mergeChannelCatalogs(base, [
      channel('ESPN Premium', ['https://new.example/a'], 'live.png'),
    ]);

    const espn = merged.find(c => c.name === 'ESPN Premium');
    expect(espn?.options.map(o => o.iframe)).toEqual([
      'https://new.example/a',
      'https://old.example/a',
      'https://old.example/b',
    ]);
  });

  it('keeps channels the live feed does not carry', () => {
    const merged = mergeChannelCatalogs(base, [channel('ESPN Premium', ['https://new.example/a'])]);
    expect(merged.map(c => c.name)).toContain('Canales de UK');
    expect(merged).toHaveLength(2);
  });

  it('adds channels only the live feed has', () => {
    const merged = mergeChannelCatalogs(base, [channel('Paramount +', ['https://new.example/p'])]);
    expect(merged.map(c => c.name)).toContain('Paramount +');
    expect(merged).toHaveLength(3);
  });

  it('matches names that differ only by case, accents or punctuation', () => {
    const merged = mergeChannelCatalogs(
      [channel('TyC Sports', ['https://old.example/tyc'])],
      [channel('TYC  Sports', ['https://new.example/tyc'])],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].options).toHaveLength(2);
    // Our spelling is the one already shown in the UI, so it wins.
    expect(merged[0].name).toBe('TyC Sports');
  });

  it('does not duplicate a URL present on both sides', () => {
    const merged = mergeChannelCatalogs(
      [channel('ESPN Premium', ['https://same.example/a', 'https://old.example/b'])],
      [channel('ESPN Premium', ['https://same.example/a'])],
    );
    expect(merged[0].options.map(o => o.iframe)).toEqual([
      'https://same.example/a',
      'https://old.example/b',
    ]);
  });

  it('drops unplayable options while merging', () => {
    const merged = mergeChannelCatalogs(
      [channel('ESPN Premium', ['undefined', 'https://old.example/b'])],
      [channel('ESPN Premium', ['https://new.example/a'])],
    );
    expect(merged[0].options.map(o => o.iframe)).toEqual([
      'https://new.example/a',
      'https://old.example/b',
    ]);
  });

  it('falls back to the live logo when we have none', () => {
    const merged = mergeChannelCatalogs(
      [channel('ESPN Premium', ['https://old.example/a'], '')],
      [channel('ESPN Premium', ['https://new.example/a'], 'live.png')],
    );
    expect(merged[0].logo).toBe('live.png');
  });
});
