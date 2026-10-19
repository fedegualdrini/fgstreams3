const MAX_URL_LENGTH = 8192;
const CANONICAL_SOURCE = 'https://la18hd.su/vivo/canales.php?stream=espnpremium';
const SOURCE_ROUTES: Record<string, string> = {
  'streamtp-golden1.click': '/global1.php',
  'streamtp99a.sbs': '/global-1.php',
  'la18hd.su': '/vivo/canales.php',
};

/** Only the observed ESPN Premium provider aliases are part of this trial. */
export function parseStreamTpUrl(input: string): string {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH || /[\s\\]/.test(input)) {
    throw new Error('Unsupported StreamTP source.');
  }
  const url = new URL(input);
  if (
    url.protocol !== 'https:' || url.href !== input || input.includes('#') || url.username || url.password || url.port || url.hash ||
    !Object.hasOwn(SOURCE_ROUTES, url.hostname) || SOURCE_ROUTES[url.hostname] !== url.pathname ||
    url.search !== '?stream=espnpremium'
  ) {
    throw new Error('Unsupported StreamTP source.');
  }
  return CANONICAL_SOURCE;
}

export function isStreamTpUrl(input: string): boolean {
  try {
    parseStreamTpUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function streamTpResolvePath(input: string): string {
  return `/api/streamtp/resolve?${new URLSearchParams({ source: parseStreamTpUrl(input) })}`;
}

/** This URL is returned to the browser, never fetched or rewritten by the server. */
export function validateStreamTpManifest(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH || /[\s\\]/.test(value)) {
    throw new Error('Unsupported StreamTP manifest.');
  }
  const url = new URL(value);
  const tokens = url.searchParams.getAll('token');
  if (
    url.protocol !== 'https:' || value.includes('#') || url.username || url.password || url.port || url.hash ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.fubo18\.com$/.test(url.hostname) ||
    !/^\/espnpremium\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.m3u8$/.test(url.pathname) ||
    tokens.length !== 1 || !tokens[0] || tokens[0].length > 4096 || /[\x00-\x1f\x7f]/.test(tokens[0])
  ) {
    throw new Error('Unsupported StreamTP manifest.');
  }
  return url.href;
}
