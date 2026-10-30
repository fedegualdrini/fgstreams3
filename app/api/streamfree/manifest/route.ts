import { NextResponse } from 'next/server';
import { parseStreamFreeEmbedUrl } from '@/lib/streamfreeDirect';
import { loadStreamFreeManifest, validateStreamFreeVariant } from '@/lib/streamfreeServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const embedUrl = params.get('embed') ?? '';
  const variant = params.get('variant');
  try {
    parseStreamFreeEmbedUrl(embedUrl);
  } catch {
    return NextResponse.json({ error: 'Unsupported StreamFree embed URL.' }, { status: 400, headers });
  }
  try {
    validateStreamFreeVariant(variant);
  } catch {
    return NextResponse.json({ error: 'Unsupported StreamFree variant.' }, { status: 400, headers });
  }
  try {
    const manifest = await loadStreamFreeManifest(embedUrl, variant, request.signal);
    return new NextResponse(manifest, {
      headers: { ...headers, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  } catch {
    // Fetch errors may contain signed URLs: never forward or log upstream error content.
    return NextResponse.json({ error: 'The provider could not serve a supported Direct playback manifest.' }, { status: 502, headers });
  }
}
