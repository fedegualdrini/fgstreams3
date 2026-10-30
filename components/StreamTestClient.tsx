'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import DirectHlsPlayer from './players/DirectHlsPlayer';
import { getDirectPlayback, type DirectPlaybackSource } from '@/lib/directPlayback';

export default function StreamTestClient() {
  const [input, setInput] = useState('');
  const [playback, setPlayback] = useState<DirectPlaybackSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Paste a current embed URL to begin.');
  const [error, setError] = useState<string | null>(null);

  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPlayback(null);
    try {
      const resolved = getDirectPlayback(input);
      if (!resolved) throw new Error('Use a supported StreamFree or embed.st embed URL, not a match page or signed playlist.');
      setPlayback(resolved);
      setAttempt(value => value + 1);
      setStatus('Resolving and loading HLS… Press play if autoplay is blocked.');
    } catch (failure) {
      setStatus('Stream test stopped.');
      setError(failure instanceof Error ? failure.message : 'Invalid embed URL.');
    }
  }

  return (
    <>
      <form className="stream-test__form" onSubmit={resolve}>
        <label htmlFor="stream-test-url" className="label">Embed URL</label>
        <div className="stream-test__controls">
          <input id="stream-test-url" type="url" required maxLength={2048} className="search-field__input stream-test__input"
            placeholder="https://strmfree.st/embed/basketball/stream-key1080p" value={input} onChange={event => setInput(event.target.value)}
            aria-describedby="stream-test-help" autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn btn--primary">Resolve &amp; play</button>
        </div>
        <p id="stream-test-help" className="stream-test__hint">Use a current StreamFree or embed.st embed URL. Resolving again refreshes the playlist signature without loading the provider iframe.</p>
      </form>
      <p role="status" className="stream-test__status">{status}</p>
      {error && <p role="alert" className="stream-test__error">{error}</p>}
      <div className="stream-test__player">
        {playback ? <DirectHlsPlayer key={attempt} src={playback.src} provider={playback.provider}
          onPlaying={() => setStatus('Playing direct HLS stream.')}
          onRecovering={number => setStatus(`Reconnecting to the same source (attempt ${number})…`)}
          onError={() => {
            setPlayback(null);
            setStatus('Stream playback failed.');
            setError('Playback failed. The stream may be offline, expired or rejected by the provider. Resolve again for a fresh URL.');
          }} />
          : <p className="stream-test__placeholder">Resolve a stream to test playback.</p>}
      </div>
      <p className="stream-test__hint">Experimental: StreamFree plays the selected source variant; embed.st exposes only its highest-quality rendition. Manifests pass through our server; media segments load directly from verified CDN hosts. Provider restrictions can still prevent playback.</p>
    </>
  );
}
