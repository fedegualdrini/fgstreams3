'use client';

/**
 * AdBanner — placeholder slots for HilltopAds (or any network).
 *
 * HOW TO ACTIVATE:
 * 1. Sign into HilltopAds dashboard → Sites → Add site → get your zone IDs
 * 2. Replace the placeholder <div> inside each size with the actual
 *    <script> tag they provide, wrapped in dangerouslySetInnerHTML.
 *
 * Example (replace the inner placeholder div):
 *   <div dangerouslySetInnerHTML={{ __html: `
 *     <script async src="//your-hilltopads-tag.js"
 *       data-zone="YOUR_ZONE_ID"></script>
 *   `}} />
 */

type AdSize = 'leaderboard' | 'rectangle';

interface AdBannerProps {
  size: AdSize;
  className?: string;
}

const AD_SIZES: Record<AdSize, { w: number; h: number; label: string }> = {
  leaderboard: { w: 728, h: 90,  label: '728×90' },
  rectangle:   { w: 300, h: 250, label: '300×250' },
};

export default function AdBanner({ size }: AdBannerProps) {
  const { w, h, label } = AD_SIZES[size];

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* ── REPLACE THIS DIV WITH YOUR HILLTOPADS SCRIPT TAG ── */}
      <div
        style={{
          width: `${w}px`,
          maxWidth: '100%',
          height: `${h}px`,
          background: 'var(--bg-2)',
          border: '1px dashed var(--line)',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '0.25rem',
          color: 'var(--muted)',
          fontSize: '0.65rem',
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.55rem', opacity: 0.5 }}>AD</span>
        <span style={{ opacity: 0.35 }}>{label}</span>
      </div>
      {/* ── END PLACEHOLDER ── */}
    </div>
  );
}
