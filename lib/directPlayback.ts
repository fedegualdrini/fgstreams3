import { embedStManifestPath, isEmbedStUrl } from './embedSt';
import { isStreamFreeEmbedUrl, streamFreeManifestPath } from './streamfreeDirect';

export type DirectProvider = 'embed-st' | 'streamfree';

export interface DirectPlaybackSource {
  src: string;
  provider: DirectProvider;
}

/** Choose by the actual supported embed URL, never a source label or arbitrary media URL. */
export function getDirectPlayback(input: string): DirectPlaybackSource | null {
  if (isEmbedStUrl(input)) {
    return { src: embedStManifestPath(input), provider: 'embed-st' };
  }
  if (isStreamFreeEmbedUrl(input)) {
    return { src: streamFreeManifestPath(input), provider: 'streamfree' };
  }
  return null;
}
