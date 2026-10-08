import { useEffect, useState } from 'react';
import type { MediaResult } from '@/types/movies';
import { hasSearchableQuery } from '@/lib/movieEmbed';

const SEARCH_DEBOUNCE_MS = 350;

async function fetchResults(query: string, type: 'movie' | 'tv'): Promise<MediaResult[]> {
  const res = await fetch(`/api/media/search?q=${encodeURIComponent(query.trim())}&type=${type}`);
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
    const timer = setTimeout(async () => {
      if (!hasSearchableQuery(query)) { setResults([]); return; }
      setLoading(true);
      try {
        setResults(await fetchResults(query, mediaType));
      } catch (error) {
        onError(error instanceof SearchRejectedError
          ? 'Search failed. Please try again.'
          : 'Search failed. Check your connection.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, mediaType, onError]);

  const reset = () => { setResults([]); setQuery(''); };

  return { query, setQuery, results, loading, reset };
}
