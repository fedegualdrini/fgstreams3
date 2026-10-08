import type { CatalogMatch, FlashscoreEntry } from '@/types/api';
import SectionHeader from './SectionHeader';
import MatchLink from './MatchLink';
import { useHorizontalScroll } from './useHorizontalScroll';

/** One live card (290px) plus the 12px gap between cards. */
const SCROLL_STEP_PX = 302;

interface LiveMatchRowProps {
  matches: CatalogMatch[];
  scores: Map<string, FlashscoreEntry>;
  onOpen: (match: CatalogMatch) => void;
}

export default function LiveMatchRow({ matches, scores, onOpen }: LiveMatchRowProps) {
  const { ref, canScrollLeft, canScrollRight, scrollBy } = useHorizontalScroll<HTMLDivElement>(matches.length);

  return (
    <section className="match-section">
      <SectionHeader live count={matches.length}>Live Now</SectionHeader>

      <div className="live-row">
        <ScrollArrow direction="left" enabled={canScrollLeft} onClick={() => scrollBy(-SCROLL_STEP_PX)} />

        <div ref={ref} className="live-row__track">
          {matches.map((match) => {
            const entry = scores.get(match.id);
            return (
              <MatchLink
                key={match.id}
                live
                match={match}
                onOpen={onOpen}
                score={entry?.score}
                scoreMinute={entry?.minute}
              />
            );
          })}
        </div>

        <ScrollArrow direction="right" enabled={canScrollRight} onClick={() => scrollBy(SCROLL_STEP_PX)} />
      </div>
    </section>
  );
}

interface ScrollArrowProps {
  direction: 'left' | 'right';
  enabled: boolean;
  onClick: () => void;
}

function ScrollArrow({ direction, enabled, onClick }: ScrollArrowProps) {
  const points = direction === 'left' ? '15,18 9,12 15,6' : '9,18 15,12 9,6';

  return (
    <button
      type="button"
      aria-label={`Scroll ${direction}`}
      data-scrollable={enabled}
      onClick={onClick}
      className={`scroll-arrow scroll-arrow--${direction}`}
    >
      <span className="scroll-arrow__glyph">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points={points} />
        </svg>
      </span>
    </button>
  );
}
