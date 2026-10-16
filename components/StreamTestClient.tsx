'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import StreamTestPlayer from './players/StreamTestPlayer';
import { STREAM_TEST_MAX_RESPONSE_BYTES, STREAM_TEST_MAX_URL_LENGTH, STREAM_TEST_TIMEOUT_MS } from '@/lib/constants';
import { encodeStreamTestRequest, STREAM_TEST_FETCH_URL } from '@/lib/streamTest';

export default function StreamTestClient() {
  const [input, setInput] = useState('');
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Paste a current embed URL to begin.');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  async function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setError(null);
    setSrc(null);
    setBusy(true);
    const timeout = setTimeout(() => active.abort(), STREAM_TEST_TIMEOUT_MS);
    try {
      const body = encodeStreamTestRequest(input);
      setStatus('Requesting a fresh stream response…');
      // Resolve on the viewer's IP; only the bounded encrypted response goes to our decoder.
      const response = await fetch(STREAM_TEST_FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body,
        cache: 'no-store',
        signal: active.signal,
      });
      if (!response.ok) throw new Error(`The stream provider returned HTTP ${response.status}. Try a current live stream.`);
      const key = response.headers.get('goat');
      if (!key) throw new Error('The provider did not expose its stream key. Its response format or CORS policy may have changed.');
      const payload = await response.arrayBuffer();
      if (payload.byteLength > STREAM_TEST_MAX_RESPONSE_BYTES) throw new Error('The provider returned an unexpected response size.');
      setStatus('Authenticating and decoding the stream…');
      const decoded = await fetch('/api/stream-test/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Stream-Key': key },
        body: payload,
        signal: active.signal,
      });
      const result: { src?: string; error?: string } = await decoded.json();
      if (!decoded.ok || !result.src) throw new Error(result.error ?? 'The stream could not be decoded.');
      if (controller.current !== active) return;
      setSrc(result.src);
      setStatus('Decoded. Loading HLS; press play if autoplay is blocked.');
    } catch (failure) {
      if (controller.current !== active) return;
      setStatus('Stream test stopped.');
      setError(active.signal.aborted
        ? 'Stream resolution timed out. Try again with a current live embed URL.'
        : failure instanceof Error ? failure.message : 'Stream resolution failed.');
    } finally {
      clearTimeout(timeout);
      if (controller.current === active) setBusy(false);
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
          <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Resolving…' : 'Resolve & play'}</button>
        </div>
        <p id="stream-test-help" className="stream-test__hint">Use a current embed.st source URL, not a match page or an old signed playlist. Resolving again requests a fresh URL.</p>
      </form>
      <p role="status" className="stream-test__status">{status}</p>
      {error && <p role="alert" className="stream-test__error">{error}</p>}
      <div className="stream-test__player">
        {src ? <StreamTestPlayer key={src} src={src}
          onPlaying={() => setStatus('Playing decoded HLS stream.')}
          onError={() => {
            setSrc(null);
            setStatus('Decoded successfully; playback failed.');
            setError('Playback failed. The stream may be offline, expired or rejected by the provider. Resolve again for a fresh URL.');
          }} />
          : <p className="stream-test__placeholder">Resolve a stream to test playback.</p>}
      </div>
      <p className="stream-test__hint">Experimental: supports this provider’s decoded HLS format only. Manifests pass through our server; media segments load directly from the CDN. Provider restrictions can still prevent playback.</p>
    </>
  );
}
