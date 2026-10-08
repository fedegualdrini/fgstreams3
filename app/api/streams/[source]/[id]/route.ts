import { fetchStreams } from '@/lib/api';
import { jsonWithCache, withErrorResponse } from '@/lib/httpRoute';
import { STREAMS_CDN_MAX_AGE, STREAMS_CDN_STALE_WHILE_REVALIDATE } from '@/lib/constants';

export const GET = withErrorResponse<{ params: Promise<{ source: string; id: string }> }>(
  'streams route',
  'Failed to fetch streams',
  async (_req, { params }) => {
    const { source, id } = await params;
    const streams = await fetchStreams(source, id);
    return jsonWithCache(streams, STREAMS_CDN_MAX_AGE, STREAMS_CDN_STALE_WHILE_REVALIDATE);
  },
);
