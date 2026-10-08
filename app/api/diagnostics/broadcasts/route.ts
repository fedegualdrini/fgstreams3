import { NextResponse } from 'next/server';
import { loadBroadcastInputs, summarizeInputs, traceQuery } from '@/lib/diagnosticsBroadcasts';

/**
 * Reports whether the broadcast pipeline can reach its upstream from wherever
 * this is deployed, and — with `?q=` — traces matches whose teams contain the
 * query through every stage. See lib/diagnosticsBroadcasts.ts for the reports.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').toLowerCase().trim();

  const inputs = await loadBroadcastInputs();
  const summary = summarizeInputs(inputs);
  const report = query ? { ...summary, ...(await traceQuery(query, inputs)) } : summary;

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
