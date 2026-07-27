'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Channel } from '@/types/channels';
import ChannelPlayer from './ChannelPlayer';
import { isValidStreamUrl } from '@/lib/urlValidation';

interface ChannelsPageClientProps {
  channels: Channel[];
}

export default function ChannelsPageClient({ channels }: ChannelsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [search, setSearch] = useState('');

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const c = searchParams.get('c');
    const o = parseInt(searchParams.get('o') ?? '0', 10);
    if (c) {
      const found = channels.find(ch => ch.name.toLowerCase() === decodeURIComponent(c).toLowerCase());
      if (found) {
        setSelectedChannel(found);
        setSelectedOptionIndex(isNaN(o) ? 0 : o);
      }
    }
  }, [channels, searchParams]);

  const syncURL = (channelName: string | null, optionIndex: number) => {
    const params = new URLSearchParams();
    if (channelName) {
      params.set('c', channelName);
      params.set('o', String(optionIndex));
    }
    const newUrl = params.size > 0 ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  };

  const closePlayer = () => {
    setSelectedChannel(null);
    setSelectedOptionIndex(0);
    syncURL(null, 0);
  };

  const handleSelectChannel = (channel: Channel) => {
    if (selectedChannel?.name === channel.name) {
      closePlayer();
      return;
    }

    setSelectedChannel(channel);
    setSelectedOptionIndex(0);
    syncURL(channel.name, 0);
  };

  const handleOptionChange = (index: number) => {
    setSelectedOptionIndex(index);
    if (selectedChannel) syncURL(selectedChannel.name, index);
  };

  useEffect(() => {
    if (!selectedChannel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePlayer();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedChannel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(q));
  }, [channels, search]);

  const validOptions = selectedChannel
    ? selectedChannel.options.filter(o => isValidStreamUrl(o.iframe))
    : [];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {selectedChannel ? (
        <>
          <div style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <div
              className="page-content"
              style={{
                height: '52px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={closePlayer}
                style={{
                  fontSize: '1.1rem',
                  color: 'var(--muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                  flexShrink: 0,
                  lineHeight: 1,
                  padding: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
                aria-label="Back to channels"
              >←</button>

              <span style={{ color: 'var(--line)', flexShrink: 0 }}>|</span>

              {selectedChannel.logo && (
                <img
                  src={selectedChannel.logo}
                  alt=""
                  style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}

              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem',
                  letterSpacing: '0.03em',
                  color: 'var(--text)',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedChannel.name}
              </span>

              <span
                className="label"
                style={{
                  fontSize: '0.55rem',
                  flexShrink: 0,
                  marginLeft: 'auto',
                  whiteSpace: 'nowrap',
                }}
              >
                {validOptions.length} source{validOptions.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div
            className="detail-layout"
            style={{
              display: 'flex',
              flexDirection: 'row',
              height: 'calc(100vh - var(--header-h) - 52px)',
              minHeight: '420px',
              overflow: 'hidden',
            }}
          >
            <section
              className="detail-player"
              style={{ flex: 1, background: '#000', position: 'relative', minWidth: 0 }}
            >
              <ChannelPlayer
                channel={selectedChannel}
                initialOptionIndex={selectedOptionIndex}
                onOptionChange={handleOptionChange}
                fillContainer
                hideTabs
              />
            </section>

            <div
              className="detail-sidebar"
              style={{
                width: '340px',
                flexShrink: 0,
                borderLeft: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-1)',
                overflow: 'hidden',
              }}
            >
              <div style={{ borderBottom: '1px solid var(--line)', flexShrink: 0, padding: '0.85rem 1rem' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', fontFamily: 'var(--font-body)' }}>
                  Channel Sources
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {validOptions.map((option, index) => {
                    const active = index === selectedOptionIndex;
                    return (
                      <button
                        key={`${selectedChannel.name}-${option.name}-${index}`}
                        type="button"
                        onClick={() => handleOptionChange(index)}
                        style={{
                          textAlign: 'left',
                          padding: '0.875rem 1rem',
                          borderRadius: '4px',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                          background: active ? 'var(--bg-2)' : 'transparent',
                          color: active ? 'var(--text)' : 'var(--text-dim)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
                          {option.name}
                        </div>
                        <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: active ? 'var(--subtle)' : 'var(--muted)', fontFamily: 'var(--font-body)' }}>
                          Option {index + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="page-content" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
          <div
            style={{
              marginBottom: '1.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', maxWidth: '360px', flex: 1 }}>
              <span
                style={{
                  position: 'absolute',
                  left: '0.875rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  fontSize: '0.9rem',
                  pointerEvents: 'none',
                }}
              >⌕</span>
              <input
                type="text"
                placeholder="Search channels…"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 1rem 0.6rem 2.25rem',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; }}
              />
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--muted)',
                fontFamily: 'var(--font-body)',
                whiteSpace: 'nowrap',
              }}
            >
              {search.trim()
                ? `${filtered.length} of ${channels.length} channels`
                : `${channels.length} channel${channels.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {filtered.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '1px',
                background: 'var(--line)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {filtered.map(channel => {
                const validCount = channel.options.filter(o => isValidStreamUrl(o.iframe)).length;
                return (
                  <ChannelTile
                    key={channel.name}
                    channel={channel}
                    validCount={validCount}
                    isHls={channel.source === 'hls'}
                    onClick={handleSelectChannel}
                  />
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📺</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-dim)', marginBottom: '0.375rem' }}>
                No channels match &ldquo;{search}&rdquo;
              </div>
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  marginTop: '0.75rem', padding: '0.4rem 1rem',
                  background: 'none', border: '1px solid var(--line)', borderRadius: '3px',
                  color: 'var(--subtle)', fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                  cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--subtle)'; }}
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelTile({
  channel, validCount, isHls, onClick,
}: {
  channel: Channel;
  validCount: number;
  isHls: boolean;
  onClick: (ch: Channel) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onClick(channel)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '0.5rem', padding: '1.25rem 0.75rem',
        background: hovered ? 'var(--bg-2)' : 'var(--bg-1)',
        border: 'none',
        borderTop: '2px solid transparent',
        cursor: 'pointer', transition: 'background 0.12s', textAlign: 'center',
      }}
    >
      {channel.logo ? (
        <img
          src={channel.logo}
          alt=""
          style={{ width: '36px', height: '36px', objectFit: 'contain' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div style={{
          width: '40px', height: '40px', background: 'var(--bg-3)',
          border: `1px solid ${hovered ? 'var(--accent)' : 'var(--line)'}`,
          borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.58rem', fontWeight: 700, fontFamily: 'var(--font-display)',
          letterSpacing: '0.04em', color: hovered ? 'var(--accent)' : 'var(--muted)',
          transition: 'all 0.12s',
        }}>
          {channel.name.slice(0, 3).toUpperCase()}
        </div>
      )}

      <span style={{
        fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.02em',
        color: hovered ? 'var(--text)' : 'var(--text-dim)',
        fontFamily: 'var(--font-body)', lineHeight: 1.3,
        maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        transition: 'color 0.12s',
      }}>
        {channel.name}
      </span>

      <span style={{ fontSize: '0.55rem', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
        {validCount} stream{validCount !== 1 ? 's' : ''}
      </span>
      {isHls && (
        <span style={{
          fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.1em',
          padding: '1px 5px', borderRadius: '3px',
          background: 'rgba(255,140,0,0.18)', color: '#ff8c00',
          border: '1px solid rgba(255,140,0,0.35)',
          fontFamily: 'var(--font-body)',
        }}>
          HLS
        </span>
      )}
    </button>
  );
}
