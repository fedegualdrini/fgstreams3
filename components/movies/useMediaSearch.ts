import { useEffect, useState } from 'react';
import type { MediaResult } from '@/types/movies';
import { hasSearchableQuery } from '@/lib/movieEmbed';

const SEARCH_DEBOUNCE_MS = 350;

async function fetchResults(query: string, type: 'movie' | 'tv', signal: AbortSignal): Promise<MediaResult[]> {
  const res = await fetch(`/api/media/search?q=${encodeURIComponent(query.trim())}&type=${type}`, { signal });
  if (!res.ok) throw new SearchRejectedError();
  return res.json();
}

class SearchRejectedError extends Error {}

/**
 * Debounced TMDB search: fires once typing has paused for 350ms. Queries
 * shorter than the minimum clear the results without hitting the API.
 */
export function useMediaSearch(
  mediaType: 'movie' | 'tv',
  onError: (message: string) => void,
) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasSearchableQuery(query)) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const nextResults = await fetchResults(query, mediaType, controller.signal);
        if (!controller.signal.aborted) setResults(nextResults);
      } catch (error) {
        if (controller.signal.aborted) return;
        onError(error instanceof SearchRejectedError
          ? 'Search failed. Please try again.'
          : 'Search failed. Check your connection.');
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, mediaType, onError]);

  const reset = () => { setResults([]); setQuery(''); };

  return { query, setQuery, results, loading, reset };
}
