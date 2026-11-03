const MAX_URL_LENGTH = 2048;

/** Decode UTF-8 slug characters without accepting escaped ASCII separators or aliases. */
export function decodeStreamFreeSlug(input: string): string {
  if (/%[0-7][0-9a-f]/i.test(input)) throw new Error('Unsupported StreamFree slug.');
  let slug: string;
  try {
    slug = decodeURIComponent(input);
  } catch {
    throw new Error('Unsupported StreamFree slug.');
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u.test(slug)) {
    throw new Error('Unsupported StreamFree slug.');
  }
  return slug;
}

/** Direct playback accepts only the provider's public /embed/<category>/<slug> URLs. */
export function parseStreamFreeEmbedUrl(input: string): URL {
  // Check the original spelling as well as URL fields: URL normalizes dot segments,
  // backslashes, escaped hostnames and whitespace before callers can inspect them.
  const path = input.length <= MAX_URL_LENGTH && input.trim() === input
    ? input.match(/^https:\/\/(?:strmfree\.st|streamfree\.top)(?::443)?\/embed\/[a-z0-9]+(?:-[a-z0-9]+)*\/([^/?#\\]+)\/?$/)
    : null;
  if (!path) {
    throw new Error('Unsupported StreamFree embed URL.');
  }
  decodeStreamFreeSlug(path[1]);
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
