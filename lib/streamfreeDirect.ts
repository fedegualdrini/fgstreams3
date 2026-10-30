const MAX_URL_LENGTH = 2048;

/** Direct playback accepts only the provider's public /embed/<category>/<slug> URLs. */
export function parseStreamFreeEmbedUrl(input: string): URL {
  // Check the original spelling as well as URL fields: URL normalizes dot segments,
  // backslashes, escaped hostnames and whitespace before callers can inspect them.
  if (input.length > MAX_URL_LENGTH || input.trim() !== input || !/^https:\/\/(?:strmfree\.st|streamfree\.top)(?::443)?\/embed\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(input)) {
    throw new Error('Unsupported StreamFree embed URL.');
  }
  const url = new URL(input);
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('Unsupported StreamFree embed URL.');
  }
  return url;
}

export function isStreamFreeEmbedUrl(input: string): boolean {
  try {
    parseStreamFreeEmbedUrl(input);
    return true;
  } catch {
    return false;
  }
}

/** Keep expiring provider signatures on the server, including for nested playlists. */
export function streamFreeManifestPath(embedUrl: string, variant?: string): string {
  const params = new URLSearchParams({ embed: parseStreamFreeEmbedUrl(embedUrl).href });
  if (variant) params.set('variant', variant);
  return `/api/streamfree/manifest?${params}`;
}
