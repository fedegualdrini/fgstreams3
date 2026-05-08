export function isSafeIframeUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidStreamUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && url.includes('.m3u8')) return true;
    return false;
  } catch {
    return false;
  }
}

export function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8');
}
