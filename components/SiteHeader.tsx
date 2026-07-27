import Link from 'next/link';

interface SiteHeaderProps {
  activeSection?: 'matches' | 'channels' | 'movies';
  liveCount?: number;
}

export default function SiteHeader({ activeSection, liveCount }: SiteHeaderProps) {
  return (
    <header style={{
      background: 'var(--bg-1)',
      borderBottom: '1px solid var(--line)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      height: 'var(--header-h)',
    }}>
      <div className="page-content" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Wordmark */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.45rem',
            letterSpacing: '0.05em',
            color: 'var(--text)',
            lineHeight: 1,
          }}>
            FG<span style={{ color: 'var(--accent)' }}>STREAMS</span>
          </span>
        </Link>

        {/* Nav */}
        <nav aria-label="Main navigation" style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}>
          <NavLink href="/" active={activeSection === 'matches'} badge={liveCount && liveCount > 0 ? liveCount : undefined}>Matches</NavLink>
          <NavLink href="/channels" active={activeSection === 'channels'}>Channels</NavLink>
          <NavLink href="/movies" active={activeSection === 'movies'}>Movies / Series</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, active, children, badge }: { href: string; active: boolean; children: React.ReactNode; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '0.375rem 0.875rem',
        borderRadius: '3px',
        textDecoration: 'none',
        transition: 'all 0.15s',
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#000' : 'var(--text-dim)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
      }}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: '16px', height: '16px', padding: '0 4px',
          background: active ? 'rgba(0,0,0,0.2)' : 'var(--red)',
          color: active ? '#000' : '#fff',
          borderRadius: '8px', fontSize: '0.5rem', fontWeight: 700,
          lineHeight: 1, letterSpacing: 0,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
