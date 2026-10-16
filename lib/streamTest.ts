import { STREAM_TEST_MAX_URL_LENGTH } from './constants';

export const STREAM_TEST_FETCH_URL = 'https://embed.st/fetch';

/** Only the provider's explicit embed shape is supported by this experiment. */
export function parseStreamTestEmbedUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter a complete https://embed.st/embed/source/id/1 URL.');
  }
  const parts = /^\/embed\/([a-z0-9-]+)\/([a-zA-Z0-9_-]+)\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (input.length > STREAM_TEST_MAX_URL_LENGTH || url.origin !== 'https://embed.st' || url.username || url.password || url.search || url.hash || !parts) {
    throw new Error('Use an embed.st URL in the form https://embed.st/embed/source/id/1.');
  }
  return url;
}

export function encodeStreamTestRequest(input: string): Uint8Array<ArrayBuffer> {
  const url = parseStreamTestEmbedUrl(input);
  const bytes: number[] = [];
  url.pathname.split('/').slice(2, 5).forEach((value, index) => {
    const field = new TextEncoder().encode(value);
    bytes.push(((index + 1) << 3) | 2);
    let length = field.length;
    while (length >= 128) {
      bytes.push((length & 127) | 128);
      length >>>= 7;
    }
    bytes.push(length, ...field);
  });
  return new Uint8Array(bytes);
}

/** Refer to the public embed and stream-relative variant, never an expiring signed URL. */
export function streamTestManifestPath(embedUrl: string, variant?: string): string {
  const params = new URLSearchParams({ embed: parseStreamTestEmbedUrl(embedUrl).href });
  if (variant) params.set('variant', variant);
  return `/api/stream-test/manifest?${params}`;
}
