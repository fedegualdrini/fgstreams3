import { Match, Stream, Sport } from '@/types/api';
import { normalizeMatches } from './matchUtils';

const API_BASE = 'https://streamed.pk/api';

export async function fetchMatches(sport?: string): Promise<Match[]> {
  // If sport is specified, fetch only that sport
  if (sport) {
    try {
      const response = await fetch(`${API_BASE}/matches/${sport}`, {
        next: { revalidate: 30 },
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error(`API Error: ${response.status} ${response.statusText} for ${API_BASE}/matches/${sport}`);
        return [];
      }
      
      const matches = await response.json();
      if (!matches || !Array.isArray(matches)) {
        return [];
      }
      
      return normalizeMatches(matches);
    } catch (error) {
      console.error(`Error fetching matches for ${sport}:`, error);
      return [];
    }
  }
  
  // If no sport specified, fetch from all sports
  try {
    const sports = await fetchSports();
    if (sports.length === 0) {
      console.warn('No sports available');
      return [];
    }
    
    // Fetch matches from all sports in parallel
    const matchPromises = sports.map(sportItem => 
      fetch(`${API_BASE}/matches/${sportItem.id}`, {
        next: { revalidate: 30 },
        headers: {
          'Accept': 'application/json',
        },
      })
        .then(response => {
          if (!response.ok) {
            console.warn(`Failed to fetch matches for ${sportItem.name}: ${response.status}`);
            return [];
          }
          return response.json();
        })
        .then(data => Array.isArray(data) ? data : [])
        .catch(error => {
          console.error(`Error fetching ${sportItem.name} matches:`, error);
          return [];
        })
    );
    
    const allMatchesArrays = await Promise.all(matchPromises);
    const allMatches = allMatchesArrays.flat();
    
    return normalizeMatches(allMatches);
  } catch (error) {
    console.error('Error fetching all matches:', error);
    return [];
  }
}

export async function fetchStreams(source: string, id: string): Promise<Stream[]> {
  try {
    const response = await fetch(`${API_BASE}/stream/${source}/${id}`, {
      next: { revalidate: 60 }, // Revalidate every minute
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch streams for ${source}/${id}: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data)) {
      return data.map(stream => ({
        url: stream.url || stream.embedUrl || '',
        embedUrl: stream.embedUrl || stream.url || '',
        language: stream.language,
        quality: stream.hd ? 'HD' : (stream.quality || 'SD'),
        source: stream.source || source,
      }));
    } else if (data && typeof data === 'object') {
      // Single stream object
      return [{
        url: data.url || data.embedUrl || '',
        embedUrl: data.embedUrl || data.url || '',
        language: data.language,
        quality: data.hd ? 'HD' : (data.quality || 'SD'),
        source: data.source || source,
      }];
    }
    
    return [];
  } catch (error) {
    console.error(`Error fetching streams for ${source}/${id}:`, error);
    return [];
  }
}

export async function fetchSports(): Promise<Sport[]> {
  try {
    const response = await fetch(`${API_BASE}/sports`, {
      next: { revalidate: 3600 } // Revalidate every hour
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sports: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching sports:', error);
    return [];
  }
}

export function getImageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://streamed.pk${path.startsWith('/') ? path : '/' + path}`;
}

/**
 * Get poster image URL from poster path
 * According to API docs, posters are served as .webp files
 */
export function getPosterUrl(posterPath: string | undefined): string {
  if (!posterPath) return '';
  if (posterPath.startsWith('http')) return posterPath;
  // Ensure .webp extension is added if not present
  const path = posterPath.startsWith('/') ? posterPath : `/${posterPath}`;
  const hasExtension = path.match(/\.(webp|jpg|jpeg|png)$/i);
  return `https://streamed.pk${path}${hasExtension ? '' : '.webp'}`;
}
