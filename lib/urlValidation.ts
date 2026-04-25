export function isSafeIframeUrl(url: string | undefined): boolean {
  if (!url || url === 'undefined') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
