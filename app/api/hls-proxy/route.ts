import { NextRequest } from 'next/server';
import { createHlsProxyHandler } from '@/lib/hlsProxy';
import { GENERATED_PROXY_HOSTS } from '@/lib/proxyHosts';
import { isLpfCdnUrl } from '@/lib/lpfUrls';

// Hand-maintained origins that predate the playlist importer.
const STATIC_HOSTS = [
  '45.5.151.147',
  '190.61.41.181',
  '138.59.227.20',
  '177.74.205.189',
  '201.217.246.42',
  '191.97.59.33',
];

// Entry points: the origins named by an option in public/channels.json.
const ALLOWED_HOSTS = new Set([...STATIC_HOSTS, ...GENERATED_PROXY_HOSTS]);

export const runtime = 'nodejs';

const handle = createHlsProxyHandler(url => ALLOWED_HOSTS.has(url.hostname) || isLpfCdnUrl(url.toString()));

export async function GET(req: NextRequest) {
  return handle(req);
}

export const HEAD = GET;

export async function OPTIONS(req: NextRequest) {
  return handle(req);
}
