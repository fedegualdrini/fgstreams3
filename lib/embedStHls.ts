import Hls from 'hls.js';
import type { HlsConfig, LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { EMBED_ST_DIRECT_MEDIA_ORIGINS } from './embedSt';

// Private transport identities: the loader resolves these before any HTTP request.
const SEGMENT_ORIGIN = 'https://embed-st-media.invalid';
const TIMESTAMP_TOLERANCE_MS = 50;
const UNSUPPORTED_TAGS = /^#EXT-X-(?:KEY|MAP|BYTERANGE|PART(?:-INF)?|PRELOAD-HINT|SKIP|DEFINE):/m;

interface SegmentIdentity {
  identity: string;
  time: number;
  duration: number;
  continuity: number;
  gap: boolean;
}

function approvedMedia(url: URL): boolean {
  return !!EMBED_ST_DIRECT_MEDIA_ORIGINS[url.origin] && !url.username && !url.password && !url.hash;
}

/** Retain only the latest window per playlist; never cache media or historical signatures. */
export class EmbedStPlaylistRewriter {
  private readonly playlists = new Map<string, Map<number, SegmentIdentity>>();
  private nextIdentity = 1;

  rewrite(text: string, playlistUrl: string): string {
    if (!text.startsWith('#EXTM3U') || !text.includes('#EXTINF:') ||
        !text.includes('#EXT-X-PROGRAM-DATE-TIME:') || UNSUPPORTED_TAGS.test(text)) {
      this.playlists.delete(playlistUrl);
      return text;
    }
    const previous = this.playlists.get(playlistUrl);
    const current = new Map<number, SegmentIdentity>();
    let sequence = 0;
    let continuity = 0;
    let time = NaN;
    let duration = NaN;
    let gap = false;
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) sequence = Number(line.slice(22));
      else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) continuity = Number(line.slice(30));
      else if (line === '#EXT-X-DISCONTINUITY') continuity++;
      else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) time = Date.parse(line.slice(25));
      else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
      else if (line === '#EXT-X-GAP') gap = true;
      else if (line && !line.startsWith('#')) {
        if (Number.isSafeInteger(sequence) && sequence >= 0 && Number.isFinite(time) &&
            Number.isFinite(duration) && duration > 0) {
          const url = new URL(line, playlistUrl);
          if (approvedMedia(url)) {
            const old = previous?.get(sequence);
            // Metadata matching, not a content hash. Other parser/demux/decoder checks remain enabled.
            const unchanged = old && old.continuity === continuity && old.duration === duration &&
              old.gap === gap && Math.abs(old.time - time) <= TIMESTAMP_TOLERANCE_MS;
            const segment: SegmentIdentity = unchanged ? old : {
              identity: `${SEGMENT_ORIGIN}/${this.nextIdentity++}`, time, duration, continuity, gap,
            };
            current.set(sequence, segment);
            // hls.js compares paths without query strings. Carry the latest real URL separately.
            lines[index] = `${segment.identity}?url=${encodeURIComponent(url.href)}`;
          }
        }
        sequence++;
        time += Math.round(duration * 1000);
        duration = NaN;
        gap = false;
      }
    }
    this.playlists.set(playlistUrl, current);
    return lines.join('\n');
  }

  resolve(input: string): string {
    const identity = new URL(input, globalThis.location?.href);
    if (identity.hostname !== 'embed-st-media.invalid') return identity.href;
    const target = identity.searchParams.get('url');
    if (identity.origin !== SEGMENT_ORIGIN || identity.username || identity.password || identity.hash ||
        !/^\/[1-9]\d*$/.test(identity.pathname) || !target) {
      throw new Error('Invalid Direct segment identity.');
    }
    const url = new URL(target);
    if (!approvedMedia(url)) throw new Error('Unsupported Direct media destination.');
    return url.href;
  }
}

/** One adapter per hls.js engine; native HLS and other providers retain their existing transport. */
export function createEmbedStLoader(): HlsConfig['loader'] {
  const rotations = new EmbedStPlaylistRewriter();
  return class EmbedStLoader extends Hls.DefaultConfig.loader {
    load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>) {
      try {
        context.url = rotations.resolve(context.url);
      } catch {
        callbacks.onError({ code: 0, text: 'Unsupported Direct media destination.' }, context, null, this.stats);
        return;
      }
      if (context.responseType !== 'text') {
        super.load(context, config, callbacks);
        return;
      }
      super.load(context, config, {
        ...callbacks,
        onSuccess: (response, stats, loadedContext, details) => {
          try {
            if (typeof response.data === 'string') response.data = rotations.rewrite(response.data, context.url);
          } catch {
            callbacks.onError({ code: 0, text: 'Invalid Direct media playlist.' }, loadedContext, details, stats);
            return;
          }
          callbacks.onSuccess(response, stats, loadedContext, details);
        },
      });
    }
  };
}
