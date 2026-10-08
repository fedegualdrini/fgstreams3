import { fetchMatchDetail } from '@/lib/flashscore';
import { jsonWithCache, withErrorResponse } from '@/lib/httpRoute';
import {
  FINISHED_MATCH_CDN_MAX_AGE,
  SCORES_CDN_MAX_AGE,
  SCORES_CDN_STALE_WHILE_REVALIDATE,
} from '@/lib/constants';

export const GET = withErrorResponse<{ params: Promise<{ flashscoreId: string }> }>(
  'match detail route',
  'Failed to fetch match detail',
  async (_req, { params }) => {
    const { flashscoreId } = await params;
    const detail = await fetchMatchDetail(flashscoreId);

    const maxAge = detail?.status === 'fin' ? FINISHED_MATCH_CDN_MAX_AGE : SCORES_CDN_MAX_AGE;
    return jsonWithCache(detail, maxAge, SCORES_CDN_STALE_WHILE_REVALIDATE);
  },
);
