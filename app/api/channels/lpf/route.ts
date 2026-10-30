import { NextResponse } from 'next/server';
import { getLpfChannelSnapshot } from '@/lib/lpf';
import { withErrorResponse } from '@/lib/httpRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handleRequest = withErrorResponse('LPF channels', 'Unable to refresh LPF links.', async request => {
  return NextResponse.json(await getLpfChannelSnapshot(request.method === 'POST'), {
    headers: { 'Cache-Control': 'no-store' },
  });
});

export const GET = handleRequest;
export const POST = handleRequest;
