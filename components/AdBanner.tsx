'use client';

import { useEffect, useRef } from 'react';

export default function AdBanner({ size }: { size: 'leaderboard' | 'rectangle' }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const s = document.createElement('script');
    s.src = '//insistentbonus.com/b/XtV.s/dOGUlq0kYwW/cv/teOmR9su/ZpUzlbkUPsTRYQ4GMET/M/5-NFjikttPN/jggIx/MdzXkg3PM_wK';
    s.async = true;
    s.referrerPolicy = 'no-referrer-when-downgrade';
    ref.current.appendChild(s);
  }, []);

  return <div ref={ref} style={{ width: '100%', display: 'flex', justifyContent: 'center', overflow: 'hidden' }} />;
}
