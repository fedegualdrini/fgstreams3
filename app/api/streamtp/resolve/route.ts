import { NextResponse } from 'next/server';
import { Impit } from 'impit';
import { parseStreamTpUrl } from '@/lib/streamTp';
import { resolveStreamTp, STREAM_TP_TIMEOUT_MS } from '@/lib/streamTpServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const client = new Impit({ browser: 'chrome', timeout: STREAM_TP_TIMEOUT_MS });

export async function GET(request: Request): Promise<Response> {
  let source: string;
  try {
    const params = new URL(request.url).searchParams;
    if (params.size !== 1 || params.getAll('source').length !== 1) {
      throw new Error('Unsupported request.');
    }
    source = parseStreamTpUrl(params.get('source') ?? '');
  } catch {
    return NextResponse.json({ error: 'Unsupported StreamTP source.' }, { status: 400, headers });
  }
  try {
    const url = await resolveStreamTp(source, request.signal, (target, options) => client.fetch(target, options));
    return NextResponse.json({ url }, { headers });
  } catch {
    // Transport errors may contain signed URLs; never log or expose provider errors.
    return NextResponse.json({ error: 'The provider could not resolve this stream.' }, { status: 502, headers });
  }
}
