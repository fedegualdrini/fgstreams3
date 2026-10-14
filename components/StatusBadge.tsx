import type { ReactNode } from 'react';

interface StatusBadgeProps {
  /** Badge text; defaults to "LIVE". The stats panel passes the match minute or "FT". */
  children?: ReactNode;
  /** Lead with the pulsing dot. */
  dot?: boolean;
  /** Tighter padding for dense layouts such as the multi-match grid. */
  compact?: boolean;
  /** Grey instead of red, for a finished match. */
  ended?: boolean;
}

/** Red status pill used wherever a match is live. Styles live in `styles/primitives.css`. */
export default function StatusBadge({ children = 'LIVE', dot = false, compact = false, ended = false }: StatusBadgeProps) {
  const className = ['status-badge', compact && 'status-badge--compact', ended && 'status-badge--ended']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={className}>
      {dot && <span className="live-dot status-badge__dot" />}
      {children}
    </span>
  );
}
