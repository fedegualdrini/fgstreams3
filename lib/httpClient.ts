import type { z } from 'zod';
import type { Logger } from './logger';
import { RETRY_BACKOFF_MS } from './constants';

/**
 * Fetch plumbing shared by every upstream we read (streamed.pk, Promiedos,
 * angulismo): optional deadline, optional retry on 5xx, and uniform logging.
 *
 * Every helper here answers `null` for "the request failed" — after logging why
 * — so callers branch on one thing and decide for themselves what a failure
 * means (empty list, last good copy, `ok: false`).
 */

export interface FetchOptions {
  log: Logger;
  /** What is being fetched, used as the subject of log lines. */
  label: string;
  /** Next.js Data Cache window in seconds. */
  revalidate: number;
  headers?: HeadersInit;
  /** Per-attempt deadline. Omit only where a hung request is harmless. */
  timeoutMs?: number;
  /** Extra attempts after the first, used only for network errors and 5xx. */
  retries?: number;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: FetchOptions): Promise<Response> {
  const { headers, revalidate, timeoutMs, retries = 0 } = options;

  for (let attempt = 0; ; attempt++) {
    const isLastAttempt = attempt >= retries;
    try {
      const response = await fetch(url, {
        headers,
        signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
        next: { revalidate },
      });
      // A 4xx will not improve on a second try; only server errors are retried.
      if (response.ok || response.status < 500 || isLastAttempt) return response;
    } catch (error) {
      if (isLastAttempt) throw error;
    }
    await wait(RETRY_BACKOFF_MS * (attempt + 1));
  }
}

/** Run the request and hand a successful response to `read`; null on any failure. */
async function load<T>(
  url: string,
  options: FetchOptions,
  read: (response: Response) => Promise<T>,
): Promise<T | null> {
  const { log, label } = options;
  try {
    const response = await fetchWithRetry(url, options);
    if (!response.ok) {
      log.warn(`${label} responded ${response.status}`);
      return null;
    }
    return await read(response);
  } catch (error) {
    log.error(`${label} failed`, error);
    return null;
  }
}

/** Response body as text, or null if the request failed. */
export function fetchText(url: string, options: FetchOptions): Promise<string | null> {
  return load(url, options, response => response.text());
}

/** Response body parsed as JSON and validated against `schema`, or null if either step failed. */
export async function fetchJson<S extends z.ZodType>(
  url: string,
  schema: S,
  options: FetchOptions,
): Promise<z.infer<S> | null> {
  const body = await load<unknown>(url, options, response => response.json());
  if (body === null) return null;

  const result = schema.safeParse(body);
  if (!result.success) {
    options.log.warn(`${options.label} returned an unexpected shape`, result.error.issues.slice(0, 3));
    return null;
  }
  return result.data;
}
