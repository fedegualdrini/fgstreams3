'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Channel } from '@/types/channels';
import ChannelPlayer from './ChannelPlayer';
import { tabButtonStyle } from '@/lib/styles';

interface ChannelsPageClientProps {
  channels: Channel[];
}

export default function ChannelsPageClient({ channels }: ChannelsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const c = searchParams.get('c');
    const o = parseInt(searchParams.get('o') ?? '0', 10);
    if (c) {
      const match = channels.find(ch => ch.name.toLowerCase() === decodeURIComponent(c).toLowerCase());
      if (match) {
        setSelectedChannel(match);
        setSelectedOptionIndex(isNaN(o) ? 0 : o);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncURL = (channelName: string | null, optionIndex: number) => {
    const params = new URLSearchParams();
    if (channelName) {
      params.set('c', channelName);
      params.set('o', String(optionIndex));
    }
    const newUrl = params.size > 0 ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  };

  const handleSelectChannel = (channel: Channel) => {
    if (selectedChannel?.name === channel.name) {
      setSelectedChannel(null);
      setSelectedOptionIndex(0);
      syncURL(null, 0);
    } else {
      setSelectedChannel(channel);
      setSelectedOptionIndex(0);
      syncURL(channel.name, 0);
    }
  };

  const handleOptionChange = (index: number) => {
    setSelectedOptionIndex(index);
    if (selectedChannel) {
      syncURL(selectedChannel.name, index);
    }
  };

  useEffect(() => {
    if (!selectedChannel) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedChannel(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedChannel]);

  const filtered = useMemo(() => {
    if (!search.trim()) return channels;
    const q = search.toLowerCase();
    return channels.filter(c => c.name.toLowerCase().includes(q));
  }, [channels, search]);

  return (
    <div style={{ flex: 1 }}>
      {/* Player panel — full width, same layout as match player */}
      {selectedChannel && (
        <div role="dialog" aria-modal="true" aria-label="Channel player">
          {/* Channel header — constrained */}
          <div className="page-content" style={{ paddingTop: '1.5rem', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {selectedChannel.logo && (
                <img
                  src={selectedChannel.logo}
                  alt=""
                  style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.6rem',
                letterSpacing: '0.04em',
                color: 'var(--text)',
                lineHeight: 1,
              }}>
                {selectedChannel.name}
              </span>
              <button
                type="button"
                onClick={() => handleSelectChannel(selectedChannel)}
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.3rem 0.75rem',
                  background: 'var(--bg-2)',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                  borderRadius: '3px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--muted)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--line)'; }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Player — full viewport width, fixed height */}
          <section style={{
            width: '100%',
            background: '#000',
            height: 'calc(100vh - var(--header-h) - 9rem)',
            minHeight: '320px',
            maxHeight: '72vh',
            position: 'relative',
            marginBottom: '1rem',
            overflow: 'hidden',
          }}>
            <ChannelPlayer
              channel={selectedChannel}
              initialOptionIndex={selectedOptionIndex}
              onOptionChange={handleOptionChange}
              fillContainer
              hideTabs
            />
          </section>

          {/* Option tabs + controls below player */}
          {(() => {
            const validOptions = selectedChannel.options.filter(o => o.iframe && o.iframe !== 'undefined');
            return validOptions.length > 1 ? (
              <div className="page-content" style={{ paddingTop: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid var(--line)', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {validOptions.map((option, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleOptionChange(i)}
                      style={tabButtonStyle(i === selectedOptionIndex)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ borderBottom: '1px solid var(--line)', marginBottom: '2rem' }} />
            );
          })()}
        </div>
      )}

      {/* Main content */}
      <div className="page-content" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
        {/* Search + count */}
        <div style={{ marginBottom: '1.75rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', maxWidth: '380px', flex: 1 }}>
            <span style={{
              position: 'absolute',
              left: '0.875rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              fontSize: '0.85rem',
              pointerEvents: 'none',
            }}>
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search channels…"
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 1rem 0.5rem 2.25rem',
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
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
            {filtered.length} channel{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Channel grid */}
        {filtered.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '1px',
            background: 'var(--line)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}>
            {filtered.map(channel => {
              const validCount = channel.options.filter(o => o.iframe && o.iframe !== 'undefined').length;
              const isSelected = selectedChannel?.name === channel.name;

              return (
                <button
                  key={channel.name}
                  type="button"
                  onClick={() => handleSelectChannel(channel)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '1rem 0.75rem',
                    background: isSelected ? 'var(--bg-2)' : 'var(--bg-1)',
                    borderTop: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)'; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-1)'; }}
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
                      width: '36px',
                      height: '36px',
                      background: 'var(--bg-3)',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                    }}>
                      ▶
                    </div>
                  )}
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: isSelected ? 'var(--text)' : 'var(--text-dim)',
                    fontFamily: 'var(--font-body)',
                    lineHeight: 1.3,
                    maxWidth: '90px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {channel.name}
                  </span>
                  <span style={{
                    fontSize: '0.55rem',
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-body)',
                  }}>
                    {validCount} stream{validCount !== 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: '4rem 1rem',
            textAlign: 'center',
            color: 'var(--subtle)',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-body)',
          }}>
            No channels for &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
