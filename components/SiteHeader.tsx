import Link from 'next/link';
import type { ReactNode } from 'react';

type Section = 'matches' | 'channels' | 'movies';

interface SiteHeaderProps {
  activeSection?: Section;
  liveCount?: number;
}

/** Counts above this render as "99+" so the badge never outgrows its pill. */
const MAX_BADGE_COUNT = 99;

export default function SiteHeader({ activeSection, liveCount }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="page-content site-header__inner">
        <Link href="/" className="site-header__wordmark">
          FG<span className="site-header__wordmark-accent">STREAMS</span>
        </Link>

        <nav aria-label="Main navigation" className="site-nav">
          <NavLink href="/" active={activeSection === 'matches'} badge={liveCount}>Matches</NavLink>
          <NavLink href="/channels" active={activeSection === 'channels'}>Channels</NavLink>
          <NavLink href="/movies" active={activeSection === 'movies'}>Movies / Series</NavLink>
        </nav>
      </div>
    </header>
  );
}

interface NavLinkProps {
  href: string;
  active: boolean;
  children: ReactNode;
  badge?: number;
}

function NavLink({ href, active, children, badge }: NavLinkProps) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className="site-nav__link">
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="site-nav__badge">{badge > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : badge}</span>
      )}
    </Link>
  );
}
