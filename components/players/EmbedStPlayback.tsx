'use client';

import { useState, type ReactNode } from 'react';
import { embedStManifestPath } from '@/lib/embedSt';
import EmbedStPlayer from './EmbedStPlayer';

interface EmbedStPlaybackProps {
  embedUrl: string;
  muted?: boolean;
  fillParent?: boolean;
  onPlaying?: () => void;
  onNextStream?: () => void;
  children: ReactNode;
}

/** Mount only the chosen engine; never load the provider iframe as an automatic fallback. */
export default function EmbedStPlayback({
  embedUrl, muted = false, fillParent = false, onPlaying, onNextStream, children,
}: EmbedStPlaybackProps) {
  const [mode, setMode] = useState<'direct' | 'embed'>('direct');
  const [phase, setPhase] = useState<'loading' | 'playing' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);

  function selectMode(next: typeof mode) {
    if (next === mode) return;
    setRecoveryAttempt(0);
    setPhase('loading');
    setMode(next);
  }

  return (
    <div className={`embed-st-playback${fillParent ? ' embed-st-playback--fill' : ''}`}>
      <div className="embed-st-playback__stage">
        {mode === 'embed' ? children : phase === 'error' ? (
          <div role="alert" className="stream-player__state stream-player__state--error embed-st-playback__error">
            <p>Direct playback failed. Retry, choose another source, or switch to Original embed.</p>
            <div className="player-overlay__actions">
              <button type="button" className="btn btn--primary" onClick={() => {
                setRecoveryAttempt(0);
                setPhase('loading');
                setAttempt(value => value + 1);
              }}>Retry direct playback</button>
              {onNextStream && <button type="button" className="btn" onClick={onNextStream}>Try next stream</button>}
            </div>
          </div>
        ) : (
          <>
            <EmbedStPlayer key={attempt} src={embedStManifestPath(embedUrl)} muted={muted}
              onPlaying={() => {
                setPhase('playing');
                onPlaying?.();
              }}
              onRecovering={number => {
                setRecoveryAttempt(number);
                setPhase('loading');
              }}
              onError={() => setPhase('error')} />
            {phase === 'loading' && (
              <p role="status" className="embed-st-playback__status">{recoveryAttempt
                ? `Reconnecting to the same source (attempt ${recoveryAttempt})…`
                : 'Loading… Press play if needed.'}</p>
            )}
          </>
        )}
      </div>
      <div role="group" aria-label="Playback mode" className="embed-st-playback__controls">
        <button type="button" className="btn" aria-pressed={mode === 'direct'} onClick={() => selectMode('direct')}
          title="High quality only on supported CDNs; slow connections may buffer. No provider iframe, ads or popups.">Direct player (HQ)</button>
        <button type="button" className="btn" aria-pressed={mode === 'embed'} onClick={() => selectMode('embed')}
          title="The provider’s original player may show ads or popups">Original embed</button>
      </div>
    </div>
  );
}
