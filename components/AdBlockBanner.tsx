'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'adblock-banner-dismissed';

export default function AdBlockBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      borderBottom: '1px solid var(--line)',
      background: 'var(--bg-1)',
      padding: '0.6rem 0',
    }}>
      <div className="page-content" style={{
        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
      }}>
        <span style={{ fontSize: '0.95rem', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>🛡️</span>
        <p style={{
          flex: 1, margin: 0,
          fontFamily: 'var(--font-body)', fontSize: '0.75rem',
          color: 'var(--text-dim)', lineHeight: 1.6,
        }}>
          For the best experience, we recommend using{' '}
          <a
            href="https://brave.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            Brave Browser
          </a>
          {' '}with the{' '}
          <a
            href="https://ublockorigin.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
          >
            uBlock Origin Lite
          </a>
          {' '}extension — together they block most ads and popups you&apos;ll encounter on streams.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, background: 'none', border: 'none',
            cursor: 'pointer', padding: '0.1rem',
            color: 'var(--muted)', lineHeight: 1, fontSize: '0.9rem',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
