export const LPF_OPTION_COUNT = 18;
export const LPF_REFRESH_INTERVAL_MS = 60_000;

export function getLpfSourceUrl(option: number): string {
  return `https://emitiendoenvivo.com/lpf/${option}.m3u8`;
}

/** Only the provider's HTTPS encoder CDN may supply resolved playlists or variants. */
export function isLpfCdnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname.endsWith('.encoders.immergo.tv')
      && url.pathname.endsWith('.m3u8');
  } catch {
    return false;
  }
}
