import { NextResponse } from 'next/server';
import { createLogger } from './logger';

/**
 * Shared plumbing for API route handlers: one error shape, one way to set the
 * CDN cache headers.
 */

/** JSON response a CDN may reuse for `maxAge` seconds, then serve stale for `staleWhileRevalidate` more while refreshing. */
export function jsonWithCache(
  data: unknown,
  maxAge: number,
  staleWhileRevalidate: number,
): NextResponse {
  return NextResponse.json(data, {
    headers: { 'Cache-Control': `s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}` },
  });
}

/**
 * Wrap a route handler so an unexpected throw is logged under `scope` and
 * answered with `502 { error: errorMessage }` instead of an unhandled 500.
 *
 *   export const GET = withErrorResponse<{ params: Promise<{ id: string }> }>(
 *     'streams route', 'Failed to fetch streams',
 *     async (_req, { params }) => jsonWithCache(await load((await params).id), 60, 30),
 *   );
 */
export function withErrorResponse<Context>(
  scope: string,
  errorMessage: string,
  handler: (request: Request, context: Context) => Promise<Response>,
): (request: Request, context: Context) => Promise<Response> {
  const log = createLogger(scope);

  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      log.error('unhandled error', error);
      return NextResponse.json({ error: errorMessage }, { status: 502 });
    }
  };
}
