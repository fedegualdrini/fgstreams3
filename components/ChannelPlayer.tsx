'use client';

import { useState, useEffect, useRef } from 'react';
import type { Channel, ChannelOption } from '@/types/channels';
import Spinner from '@/components/Spinner';
import { tabButtonStyle } from '@/lib/styles';
import { CHANNEL_LOAD_TIMEOUT_MS } from '@/lib/constants';
import { isValidStreamUrl, isHlsUrl } from '@/lib/urlValidation';
import HLSVideoPlayer from '@/components/HLSVideoPlayer';

interface ChannelPlayerProps {
  channel: Channel;
  initialOptionIndex?: number;
  onOptionChange?: (index: number) => void;
  fillContainer?: boolean;
  hideTabs?: boolean;
}

export default function ChannelPlayer({ channel, initialOptionIndex = 0, onOptionChange, fillContainer = false, hideTabs = false }: ChannelPlayerProps) {
  const validOptions = channel.options.filter(o => isValidStreamUrl(o.iframe));
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(initialOptionIndex, Math.max(validOptions.length - 1, 0))
  );
  const [isLoading, setIsLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentOption: ChannelOption | undefined = validOptions[selectedIndex];

  useEffect(() => {
    const clamped = Math.min(initialOptionIndex, Math.max(validOptions.length - 1, 0));
    setSelectedIndex(clamped);
  }, [initialOptionIndex, validOptions.length]);

  useEffect(() => {
    setIsLoading(true);
    setTimedOut(false);
    setLoadingSeconds(0);
    const ticker = setInterval(() => setLoadingSeconds(s => s + 1), 1000);
    timeoutRef.current = setTimeout(() => {
      clearInterval(ticker);
      setTimedOut(true);
      setIsLoading(false);
    }, CHANNEL_LOAD_TIMEOUT_MS);
    return () => {
      clearInterval(ticker);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [selectedIndex, reloadKey]);

  const selectOption = (index: number) => {
    setSelectedIndex(index);
    onOptionChange?.(index);
  };

  const tryNextOption = () => {
    if (validOptions.length < 2) return;
    selectOption((selectedIndex + 1) % validOptions.length);
  };

  const reloadPlayer = () => setReloadKey(k => k + 1);

  if (validOptions.length === 0) {
    return (
      <div
        className={fillContainer ? undefined : 'video-container'}
        style={{
          ...(fillContainer ? { width: '100%', height: '100%' } : {}),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
        }}
      >
        No streams available for this channel
      </div>
    );
  }

  return (
    <div style={fillContainer
      ? { width: '100%', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const }
      : { width: '100%' }
    }>
      {!fillContainer && !hideTabs && validOptions.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '0.75rem' }}>
          {validOptions.map((option, i) => (
            <button key={i} type="button" onClick={() => selectOption(i)} style={tabButtonStyle(i === selectedIndex)}>
              {option.name}
            </button>
          ))}
        </div>
      )}
      <div
        className={fillContainer ? undefined : 'video-container'}
        style={fillContainer ? { position: 'relative' as const, width: '100%', flex: 1, minHeight: 0 } : { position: 'relative' as const }}
      >
        {isLoading && !timedOut && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', zIndex: 10 }}>
            <Spinner label={`Connecting to stream… (${loadingSeconds}s)`} />
          </div>
        )}
        {timedOut && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', zIndex: 10, gap: '1rem' }}>
            <p style={{ color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600 }}>Stream not responding</p>
            <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '0.75rem', marginTop: '-0.5rem' }}>Try a different option</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {validOptions.length > 1 && (
                <button type="button" onClick={tryNextOption} style={{ padding: '0.5rem 1.25rem', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                  Try next
                </button>
              )}
              <button type="button" onClick={reloadPlayer} style={{ padding: '0.5rem 1.25rem', background: 'var(--bg-2)', color: 'var(--text-dim)', border: '1px solid var(--line)', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          </div>
        )}
        {fillContainer && !hideTabs && validOptions.length > 1 && (
          <div style={{ position: 'absolute', bottom: '0.75rem', left: '0.75rem', zIndex: 20, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {validOptions.map((option, i) => (
              <button key={i} type="button" onClick={() => selectOption(i)} style={tabButtonStyle(i === selectedIndex)}>
                {option.name}
              </button>
            ))}
          </div>
        )}
        {currentOption && isHlsUrl(currentOption.iframe) ? (
          <HLSVideoPlayer
            key={`${channel.name}-${selectedIndex}-${reloadKey}`}
            src={currentOption.iframe}
            onPlaying={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setIsLoading(false);
              setTimedOut(false);
            }}
            onError={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setIsLoading(false);
              setTimedOut(true);
            }}
          />
        ) : currentOption ? (
          <iframe
            key={`${channel.name}-${selectedIndex}-${reloadKey}`}
            src={currentOption.iframe}
            title={`${channel.name} - ${currentOption.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            onLoad={() => {
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setIsLoading(false);
              setTimedOut(false);
            }}
          />
        ) : null}
      </div>
      {!fillContainer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.625rem' }}>
          <button type="button" onClick={reloadPlayer}
            style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0, transition: 'color 0.12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
          >
            Reload
          </button>
          {validOptions.length > 1 && (
            <button type="button" onClick={tryNextOption}
              style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', padding: 0, transition: 'color 0.12s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; }}
            >
              Next option
            </button>
          )}
          {currentOption && (
            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', marginLeft: 'auto', fontFamily: 'var(--font-body)' }}>
              {currentOption.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
