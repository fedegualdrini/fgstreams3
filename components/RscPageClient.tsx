'use client';

import { useState } from 'react';

interface RscPageClientProps {
  data: any;
}

type MatchGroup = {
  league?: any;
  matches?: any[];
};

export default function RscPageClient({ data }: RscPageClientProps) {
  const groups: MatchGroup[] = Array.isArray(data?.data) ? data.data : [];
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [detailJson, setDetailJson] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadDetail = async (id: string) => {
    if (!id) return;
    setSelectedMatchId(id);
    setIsLoadingDetail(true);
    setError(null);
    setDetailJson(null);

    try {
      const res = await fetch(`/api/rsc/detail/${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError(`Failed to load detail (${res.status})`);
        return;
      }
      const json = await res.json();
      setDetailJson(json);
    } catch (e) {
      setError('Network error while loading detail');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const totalMatches = groups.reduce(
    (sum, g) => sum + (Array.isArray(g.matches) ? g.matches.length : 0),
    0
  );

  const embedUrl: string | null = (() => {
    if (!detailJson || !detailJson.data || !Array.isArray(detailJson.data.sources)) return null;
    const first = detailJson.data.sources.find((s: any) => s?.embedUrl) ?? detailJson.data.sources[0];
    return first?.embedUrl || null;
  })();

  return (
    <div style={{ flex: 1 }}>
      <div className="page-content" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            letterSpacing: '0.04em',
            color: 'var(--text)',
            marginBottom: '0.5rem',
          }}>
            RSC (SportSRC V2)
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--muted)',
            maxWidth: '640px',
          }}>
            This page shows the exact JSON returned from SportSRC V2. The top section lists live football matches,
            and you can load per-match detail (including stream embed URLs) on demand to preserve your free-tier quota.
          </p>
        </header>

        {!data && (
          <div style={{
            padding: '2rem 1rem',
            borderRadius: '6px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--subtle)',
          }}>
            No data available from SportSRC at the moment. This may be due to rate limits, network issues, or no
            matching fixtures for the current query.
          </div>
        )}

        {data && groups.length === 0 && (
          <div style={{
            padding: '2rem 1rem',
            borderRadius: '6px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--subtle)',
          }}>
            The response from SportSRC does not contain any league groups. Below is the raw JSON payload for inspection.
          </div>
        )}

        {groups.length > 0 && (
          <section style={{ marginBottom: '2.5rem' }}>
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}>
                Leagues ({groups.length}) • Matches ({totalMatches})
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {groups.map((group, leagueIndex) => {
                const league = group.league ?? {};
                const matches = Array.isArray(group.matches) ? group.matches : [];

                return (
                  <div
                    key={league.name ?? leagueIndex}
                    style={{
                      borderRadius: '6px',
                      border: '1px solid var(--line)',
                      background: 'var(--bg-2)',
                      padding: '0.9rem 1rem',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.8rem',
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                      {league.logo && (
                        <img
                          src={league.logo}
                          alt=""
                          style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{league.name ?? `League #${leagueIndex + 1}`}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                          {league.country ?? 'Unknown country'} • {matches.length} match{matches.length !== 1 ? 'es' : ''}
                        </div>
                      </div>
                    </div>

                    {matches.length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: '0.6rem',
                      }}>
                        {matches.map((m: any) => {
                          const id = m.id as string | undefined;
                          const home = m.teams?.home?.name;
                          const away = m.teams?.away?.name;
                          const title = m.title ?? (home && away ? `${home} vs ${away}` : id);

                          return (
                            <div
                              key={id ?? title}
                              style={{
                                borderRadius: '4px',
                                border: '1px solid var(--line)',
                                background: 'var(--bg-1)',
                                padding: '0.6rem 0.7rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.25rem',
                              }}
                            >
                              <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                {title}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                {m.status_detail ?? m.status ?? ''} • {m.round ?? ''}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                                {m.score?.display ?? ''}
                              </div>
                              {id && (
                                <button
                                  type="button"
                                  onClick={() => handleLoadDetail(id)}
                                  style={{
                                    marginTop: '0.4rem',
                                    alignSelf: 'flex-start',
                                    padding: '0.25rem 0.6rem',
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.08em',
                                    borderRadius: '3px',
                                    border: '1px solid var(--line)',
                                    background: selectedMatchId === id ? 'var(--accent)' : 'var(--bg-2)',
                                    color: selectedMatchId === id ? '#000' : 'var(--text-dim)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {selectedMatchId === id && isLoadingDetail ? 'Loading…' : 'Load detail JSON'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(detailJson || error || isLoadingDetail) && (
          <section style={{ marginTop: '1.5rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: '0.5rem',
            }}>
              Match Detail {selectedMatchId ? `(${selectedMatchId})` : ''}
            </h2>

            {embedUrl && (
              <div style={{
                marginBottom: '0.75rem',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid var(--line)',
                background: '#000',
              }}>
                <div style={{
                  padding: '0.4rem 0.6rem',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.75rem',
                  color: 'var(--muted)',
                  borderBottom: '1px solid var(--line)',
                  background: 'var(--bg-2)',
                }}>
                  Embedded player (SportSRC `embedUrl`)
                </div>
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#000' }}>
                  <iframe
                    src={embedUrl}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      border: '0',
                    }}
                    scrolling="no"
                    allow="autoplay; fullscreen; encrypted-media"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            {error && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #7f1d1d',
                background: '#450a0a',
                color: '#fecaca',
                fontSize: '0.8rem',
              }}>
                {error}
              </div>
            )}
            {isLoadingDetail && !error && (
              <div style={{
                marginBottom: '0.75rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                color: 'var(--muted)',
              }}>
                Loading detail from SportSRC…
              </div>
            )}
            {detailJson && (
              <pre style={{
                maxHeight: '420px',
                overflow: 'auto',
                background: 'var(--bg-2)',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                padding: '0.75rem 0.9rem',
                fontSize: '0.75rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                color: 'var(--muted)',
                whiteSpace: 'pre',
              }}>
                {JSON.stringify(detailJson, null, 2)}
              </pre>
            )}
          </section>
        )}

        {data && (
          <section style={{ marginTop: '2rem' }}>
            <h2 style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: '0.5rem',
            }}>
              Raw Matches Response
            </h2>
            <pre style={{
              maxHeight: '420px',
              overflow: 'auto',
              background: 'var(--bg-2)',
              borderRadius: '6px',
              border: '1px solid var(--line)',
              padding: '0.75rem 0.9rem',
              fontSize: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              color: 'var(--muted)',
              whiteSpace: 'pre',
            }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
}

