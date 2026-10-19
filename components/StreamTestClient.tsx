'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import DirectHlsPlayer from './players/DirectHlsPlayer';
import { EMBED_ST_MAX_URL_LENGTH } from '@/lib/constants';
import { embedStManifestPath, isEmbedStUrl } from '@/lib/embedSt';
import { isStreamTpUrl } from '@/lib/streamTp';

type TestSource = { provider: 'embed-st' | 'streamtp'; src: string };

export default function StreamTestClient() {
  const [input, setInput] = useState('');
  const [source, setSource] = useState<TestSource | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('Paste a supported source URL to begin.');
  const [error, setError] = useState<string | null>(null);

  function resolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSource(null);
    try {
      if (isEmbedStUrl(input)) {
        setSource({ provider: 'embed-st', src: embedStManifestPath(input) });
      } else if (isStreamTpUrl(input)) {
        setSource({ provider: 'streamtp', src: input.trim() });
      } else {
        throw new Error('Use a current embed.st source URL or a supported StreamTP/la18hd ESPN Premium source URL.');
      }
      setAttempt(value => value + 1);
      setStatus('Resolving and loading HLS… Press play if autoplay is blocked.');
    } catch (failure) {
      setStatus('Stream test stopped.');
      setError(failure instanceof Error ? failure.message : 'Invalid source URL.');
    }
  }

  return (
    <>
      <form className="stream-test__form" onSubmit={resolve}>
        <label htmlFor="stream-test-url" className="label">Source URL</label>
        <div className="stream-test__controls">
          <input id="stream-test-url" type="url" required maxLength={EMBED_ST_MAX_URL_LENGTH} className="search-field__input stream-test__input"
            placeholder="https://la18hd.su/vivo/canales.php?stream=espnpremium" value={input} onChange={event => setInput(event.target.value)}
            aria-describedby="stream-test-help" autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn btn--primary">Resolve &amp; play</button>
        </div>
        <p id="stream-test-help" className="stream-test__hint">Use a current embed.st source URL or the verified StreamTP/la18hd ESPN Premium page, such as https://la18hd.su/vivo/canales.php?stream=espnpremium. Other StreamTP channels, arbitrary HLS URLs and extension sources are not supported here. Resolving again requests a fresh URL.</p>
      </form>
      <p role="status" className="stream-test__status">{status}</p>
      {error && <p role="alert" className="stream-test__error">{error}</p>}
      <div className="stream-test__player">
        {source ? <DirectHlsPlayer key={attempt} provider={source.provider} src={source.src}
          onPlaying={() => setStatus('Playing decoded HLS stream.')}
          onRecovering={number => setStatus(`Reconnecting to the same source (attempt ${number})…`)}
          onError={() => {
            setSource(null);
            setStatus('Stream playback failed.');
            setError('Playback failed. The stream may be offline, expired or rejected by the provider. Resolve again for a fresh URL.');
          }} />
          : <p className="stream-test__placeholder">Resolve a stream to test playback.</p>}
      </div>
      <p className="stream-test__hint">Experimental: embed.st relays manifests only; its media loads directly from supported CDN hosts, with highest-quality rendition only. StreamTP resolves metadata only; all its manifests and audio/video load directly from the provider CDN with no media fallback. Neither source loads a provider iframe here. Provider restrictions can still prevent playback.</p>
      <p className="stream-test__hint">StreamTP deployment finding: locally resolved URLs played successfully, but Vercel-resolved URLs returned CDN 403 during testing. The provider document cannot be read directly across browser origins. This trial has no media-relay fallback and is not ready for normal Vercel playback.</p>
    </>
  );
}
