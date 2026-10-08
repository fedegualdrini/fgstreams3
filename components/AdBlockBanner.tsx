'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'adblock-banner-dismissed';

export default function AdBlockBanner() {
  const [visible, setVisible] = useState(false);

  // Read after mount: sessionStorage doesn't exist during server rendering.
  useEffect(() => {
    if (!sessionStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="adblock-banner">
      <div className="page-content adblock-banner__inner">
        <span className="adblock-banner__icon" aria-hidden="true">🛡️</span>
        <p className="adblock-banner__text">
          For the best experience, we recommend using{' '}
          <ExternalLink href="https://brave.com">Brave Browser</ExternalLink>
          {' '}with the{' '}
          <ExternalLink href="https://ublockorigin.com">uBlock Origin Lite</ExternalLink>
          {' '}extension — together they block most ads and popups you&apos;ll encounter on streams.
        </p>
        <button type="button" className="adblock-banner__dismiss" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="adblock-banner__link">
      {children}
    </a>
  );
}
