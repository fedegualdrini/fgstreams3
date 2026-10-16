import { NextResponse } from 'next/server';
import { withErrorResponse } from '@/lib/httpRoute';
import { decodeStreamTestResponse, readStreamTestResponse, streamTestManifestPath } from '@/lib/streamTestServer';

export const runtime = 'nodejs';

export const POST = withErrorResponse('stream-test decode', 'Unable to decode stream response.', async request => {
  try {
    const url = decodeStreamTestResponse(await readStreamTestResponse(request), request.headers.get('X-Stream-Key'));
    return NextResponse.json({ src: streamTestManifestPath(url) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { error: 'The provider response could not be authenticated or decoded. Resolve the stream again.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});
