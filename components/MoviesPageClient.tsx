'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { MediaResult, TvDetail } from '@/types/movies';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';
const VIDSRC_BASE = 'https://vidsrcme.ru/embed';

function buildEmbedUrl(
  item: MediaResult,
  season?: number,
  episode?: number
): string {
  if (item.type === 'movie') {
    return `${VIDSRC_BASE}/movie?tmdb=${item.tmdbId}&ds_lang=en`;
  }
  const s = season ?? 1;
  const e = episode ?? 1;
  return `${VIDSRC_BASE}/tv?tmdb=${item.tmdbId}&season=${s}&episode=${e}&ds_lang=en`;
}

export default function MoviesPageClient() {
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaResult | null>(null);
  const [tvDetail, setTvDetail] = useState<TvDetail | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search — fires 350ms after typing stops
  const search = useCallback(async (q: string, type: 'movie' | 'tv') => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/media/search?q=${encodeURIComponent(q.trim())}&type=${type}`
      );
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query, mediaType), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mediaType, search]);

  // Fetch season structure when a TV show is selected
  useEffect(() => {
    if (!selected || selected.type !== 'tv') { setTvDetail(null); return; }
    setSeason(1);
    setEpisode(1);
    fetch(`/api/media/tv/${selected.tmdbId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setTvDetail)
      .catch(() => setTvDetail(null));
  }, [selected]);

  // Reset episode to 1 when season changes
  useEffect(() => { setEpisode(1); }, [season]);

  const currentSeason = tvDetail?.seasons.find(s => s.seasonNumber === season);
  const episodeCount = currentSeason?.episodeCount ?? 0;
  const embedUrl = selected ? buildEmbedUrl(selected, season, episode) : null;

  const handleSelect = (item: MediaResult) => {
    setSelected(item);
    setTimeout(() => {
      document.getElementById('media-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>

      {/* ── Type Toggle ── */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem' }}>
        {(['movie', 'tv'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setMediaType(t); setResults([]); setSelected(null); setQuery(''); }}
            style={{
              padding: '0.375rem 1rem',
              background: mediaType === t ? 'var(--accent)' : 'var(--bg-2)',
              color: mediaType === t ? '#000' : 'var(--text-dim)',
              border: `1px solid ${mediaType === t ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {t === 'movie' ? 'Movies' : 'TV Series'}
          </button>
        ))}
      </div>

      {/* ── Search bar ── */}
      <div style={{ position: 'relative', maxWidth: '480px', marginBottom: '1.75rem' }}>
        <span style={{
          position: 'absolute', left: '0.875rem', top: '50%',
          transform: 'translateY(-50%)', color: 'var(--muted)',
          pointerEvents: 'none', display: 'flex', alignItems: 'center',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          placeholder={mediaType === 'movie' ? 'Search movies…' : 'Search TV series…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          style={{
            width: '100%',
            padding: '0.65rem 1rem 0.65rem 2.5rem',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: '4px', color: 'var(--text)',
            fontFamily: 'var(--font-body)', fontSize: '0.875rem',
            outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onBlur={(e) =>  { e.currentTarget.style.borderColor = 'var(--line)'; }}
        />
        {loading && (
          <span style={{
            position: 'absolute', right: '0.875rem', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '0.75rem',
          }}>…</span>
        )}
      </div>

      {/* ── Player (appears when an item is selected) ── */}
      {selected && embedUrl && (
        <div id="media-player" style={{ marginBottom: '2rem' }}>

          {/* Title + controls bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            marginBottom: '0.75rem', flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: '1.2rem',
              color: 'var(--text)', letterSpacing: '0.03em',
            }}>
              {selected.title}
            </span>
            {selected.year && (
              <span style={{ fontSize: '0.7rem', color: 'var(--subtle)' }}>
                {selected.year}
              </span>
            )}

            {/* Season / Episode selectors for TV shows */}
            {selected.type === 'tv' && tvDetail && (
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <select
                  value={season}
                  onChange={(e) => setSeason(Number(e.target.value))}
                  style={{
                    padding: '0.3rem 0.6rem', background: 'var(--bg-2)',
                    border: '1px solid var(--line)', borderRadius: '3px',
                    color: 'var(--text)', fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >
                  {tvDetail.seasons.map((s) => (
                    <option key={s.seasonNumber} value={s.seasonNumber}>
                      {s.name}
                    </option>
                  ))}
                </select>

                {episodeCount > 0 && (
                  <select
                    value={episode}
                    onChange={(e) => setEpisode(Number(e.target.value))}
                    style={{
                      padding: '0.3rem 0.6rem', background: 'var(--bg-2)',
                      border: '1px solid var(--line)', borderRadius: '3px',
                      color: 'var(--text)', fontFamily: 'var(--font-body)',
                      fontSize: '0.75rem', cursor: 'pointer',
                    }}
                  >
                    {Array.from({ length: episodeCount }, (_, i) => i + 1).map((ep) => (
                      <option key={ep} value={ep}>Episode {ep}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Close button */}
            <button
              type="button"
              aria-label="Close player"
              onClick={() => setSelected(null)}
              style={{
                marginLeft: selected.type === 'tv' && tvDetail ? '0' : 'auto',
                background: 'none', border: '1px solid var(--line)',
                borderRadius: '3px', color: 'var(--muted)',
                padding: '0.25rem 0.6rem', cursor: 'pointer',
                fontSize: '0.7rem', fontFamily: 'var(--font-body)',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--muted)'; }}
            >
              ✕ Close
            </button>
          </div>

          {/* 16:9 iframe — use .video-container class (matches StreamPlayer/ChannelPlayer pattern) */}
          <div className="video-container">
            <iframe
              key={embedUrl}
              src={embedUrl}
              allowFullScreen
              allow="fullscreen; autoplay"
              referrerPolicy="origin"
              title={selected.title}
            />
          </div>
        </div>
      )}

      {/* ── Results grid ── */}
      {results.length > 0 && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            marginBottom: '1rem',
          }}>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.1rem',
              color: 'var(--text)', letterSpacing: '0.04em', lineHeight: 1,
            }}>
              Results
              <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', color: 'var(--subtle)' }}>
                {results.length}
              </span>
            </h2>
            <div style={{ flex: 1, height: '1px', background: 'var(--line)' }} />
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '12px',
          }}>
            {results.map((item) => (
              <MediaCard
                key={item.tmdbId}
                item={item}
                isSelected={selected?.tmdbId === item.tmdbId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty states */}
      {query.trim().length >= 2 && !loading && results.length === 0 && (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>
          No results for &ldquo;{query}&rdquo;
        </div>
      )}
      {query.trim().length < 2 && !selected && (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--subtle)', fontSize: '0.875rem' }}>
          Type at least 2 characters to search
        </div>
      )}
    </div>
  );
}

/* ─── MediaCard ──────────────────────────────────────────────────────────────── */

function MediaCard({
  item, isSelected, onSelect,
}: {
  item: MediaResult;
  isSelected: boolean;
  onSelect: (item: MediaResult) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-2)',
        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: '6px', overflow: 'hidden',
        cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        padding: 0, width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isSelected ? 'var(--accent)' : 'var(--line)';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Poster — 2:3 aspect ratio */}
      <div style={{
        width: '100%', aspectRatio: '2/3',
        background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {item.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${TMDB_IMAGE_BASE}${item.posterPath}`}
            alt={item.title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
               style={{ color: 'var(--subtle)' }} aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="17" x2="22" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '0.5rem 0.6rem' }}>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600,
          color: 'var(--text)', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.title}
        </div>
        <div style={{
          marginTop: '0.25rem', fontSize: '0.62rem', color: 'var(--subtle)',
          display: 'flex', gap: '0.5rem',
        }}>
          {item.year && <span>{item.year}</span>}
          {item.voteAverage > 0 && (
            <span style={{ color: 'var(--accent)' }}>★ {item.voteAverage.toFixed(1)}</span>
          )}
        </div>
      </div>
    </button>
  );
}
