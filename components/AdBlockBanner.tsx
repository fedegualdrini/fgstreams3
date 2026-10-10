'use client';

import { useState } from 'react';
import { ADBLOCK_BANNER_STORAGE_KEY } from '@/lib/adBlockBanner';

export default function AdBlockBanner() {
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    try {
      sessionStorage.setItem(ADBLOCK_BANNER_STORAGE_KEY, '1');
    } catch {
      // Storage can be blocked; the banner then simply stays dismissed for this page view.
    }
    setDismissed(true);
  };

  if (dismissed) return null;

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
