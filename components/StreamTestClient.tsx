'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import StreamTestPlayer from './players/StreamTestPlayer';
import { STREAM_TEST_MAX_URL_LENGTH } from '@/lib/constants';
import { streamTestManifestPath } from '@/lib/streamTest';

export default function StreamTestClient() {
  const [input, setInput] = useState('');
  const [src, setSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Paste a current embed URL to begin.');
  const [error, setError] = useState<string | null>(null);

  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSrc(null);
    try {
      setSrc(streamTestManifestPath(input));
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
          <input id="stream-test-url" type="url" required maxLength={STREAM_TEST_MAX_URL_LENGTH} className="search-field__input stream-test__input"
            placeholder="https://embed.st/embed/admin/stream-id/1" value={input} onChange={event => setInput(event.target.value)}
            aria-describedby="stream-test-help" autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn btn--primary">Resolve &amp; play</button>
        </div>
        <p id="stream-test-help" className="stream-test__hint">Use a current embed.st source URL, not a match page or an old signed playlist. Resolving again requests a fresh URL.</p>
      </form>
      <p role="status" className="stream-test__status">{status}</p>
      {error && <p role="alert" className="stream-test__error">{error}</p>}
      <div className="stream-test__player">
        {src ? <StreamTestPlayer key={attempt} src={src}
          onPlaying={() => setStatus('Playing decoded HLS stream.')}
          onError={() => {
            setSrc(null);
            setStatus('Stream playback failed.');
            setError('Playback failed. The stream may be offline, expired or rejected by the provider. Resolve again for a fresh URL.');
          }} />
          : <p className="stream-test__placeholder">Resolve a stream to test playback.</p>}
      </div>
      <p className="stream-test__hint">Experimental: supports this provider’s decoded HLS format only. Manifests pass through our server; media segments load directly from the CDN. Provider restrictions can still prevent playback.</p>
    </>
  );
}
