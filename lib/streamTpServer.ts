import { load } from 'cheerio';
import { parseStreamTpUrl, validateStreamTpManifest } from './streamTp';

export const STREAM_TP_MAX_DOCUMENT_BYTES = 256 * 1024;
export const STREAM_TP_TIMEOUT_MS = 15_000;
type DocumentResponse = Pick<Response, 'status' | 'url' | 'headers'> & {
  body: ReadableStream<Uint8Array> | null;
};
type DocumentFetch = (url: string, options: {
  method: 'GET';
  redirect: 'error';
  signal: AbortSignal;
  headers: Record<string, string>;
}) => Promise<DocumentResponse>;

/** Parse only a complete literal assignment, never the provider's player or P2P code. */
export function extractStreamTpManifest(document: string): string {
  if (Buffer.byteLength(document, 'utf8') > STREAM_TP_MAX_DOCUMENT_BYTES) {
    throw new Error('Unsupported provider document.');
  }
  const html = load(document);
  const configs: unknown[] = [];
  html('script:not([src])').each((_, element) => {
    const text = html(element).text();
    const assignment = /^\s*window\.CDNPEER\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
    if (assignment) configs.push(JSON.parse(assignment[1]));
  });
  if (configs.length !== 1) throw new Error('Unsupported provider configuration.');
  const config = configs[0];
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      !('stream' in config) || config.stream !== 'espnpremium' || !('src' in config)) {
    throw new Error('Unsupported provider configuration.');
  }
  return validateStreamTpManifest(config.src);
}

/** The transport has one fixed HTML destination; the returned CDN URL is never fetched here. */
export async function resolveStreamTp(
  source: string,
  requestSignal: AbortSignal,
  fetchDocument: DocumentFetch,
): Promise<string> {
  const canonical = parseStreamTpUrl(source);
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(STREAM_TP_TIMEOUT_MS)]);
  signal.throwIfAborted();
  const response = await fetchDocument(canonical, {
    method: 'GET',
    redirect: 'error',
    signal,
    headers: { Accept: 'text/html' },
  });
  const body = response.body;
  if (!body) throw new Error('Missing provider document.');
  const reader = body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let complete = false;
  try {
    signal.throwIfAborted();
    if (response.status !== 200 || response.url !== canonical ||
        Number(response.headers.get('content-length')) > STREAM_TP_MAX_DOCUMENT_BYTES) {
      throw new Error('Unsupported provider response.');
    }
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks: string[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > STREAM_TP_MAX_DOCUMENT_BYTES) throw new Error('Provider document is too large.');
      chunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    complete = true;
    return extractStreamTpManifest(chunks.join(''));
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}
