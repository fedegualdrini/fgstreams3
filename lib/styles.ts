import type React from 'react';

export function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.3rem 0.75rem',
    background: active ? 'var(--accent)' : 'var(--bg-2)',
    color: active ? '#000' : 'var(--text-dim)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    borderRadius: '3px',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontFamily: 'var(--font-body)',
    cursor: 'pointer',
    transition: 'all 0.12s',
  };
}

export function hoverButtonStyle(hovered: boolean): React.CSSProperties {
  return {
    opacity: hovered ? 1 : 0.6,
    transition: 'opacity 0.15s',
  };
}
