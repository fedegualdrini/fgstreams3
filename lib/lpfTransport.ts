import { isLpfCdnUrl } from './lpfUrls';

export const LPF_REQUEST_TIMEOUT_MS = 10_000;
export const LPF_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

/** Validate every redirect; cached links cannot select an arbitrary host. */
export async function fetchLpfPlaylist(url: string, deadline: AbortSignal): Promise<Response> {
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!isLpfCdnUrl(url)) throw new Error('Unsupported LPF CDN destination');
    const response = await fetch(url, {
      redirect: 'manual', cache: 'no-store', headers: LPF_REQUEST_HEADERS,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(LPF_REQUEST_TIMEOUT_MS)]),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('LPF CDN redirect has no destination');
    url = new URL(location, url).href;
  }
  throw new Error('Too many LPF CDN redirects');
}
