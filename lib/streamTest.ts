import { STREAM_TEST_MAX_URL_LENGTH } from './constants';

export const STREAM_TEST_FETCH_URL = 'https://embed.st/fetch';

/** Only the provider's explicit embed shape is supported by this experiment. */
export function encodeStreamTestRequest(input: string): Uint8Array<ArrayBuffer> {
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
  const bytes: number[] = [];
  parts.slice(1).forEach((value, index) => {
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
