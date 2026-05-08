export function isSafeIframeUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Accepts both http: and https: — HTTP streams are routed through the HLS proxy
// via toProxyUrl() in HLSVideoPlayer before any network request is made.
export function isValidStreamUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

export function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8');
}
