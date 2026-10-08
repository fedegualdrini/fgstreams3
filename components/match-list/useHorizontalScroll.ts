import { useCallback, useEffect, useRef, useState } from 'react';

// Slack so sub-pixel rounding never leaves an arrow showing at the very edge.
const EDGE_TOLERANCE_PX = 4;

/**
 * Tracks whether a horizontally scrolling element has more content on either
 * side, and scrolls it by a delta (instantly when the user prefers reduced
 * motion). `contentKey` should change whenever the scrollable content does.
 */
export function useHorizontalScroll<T extends HTMLElement>(contentKey: unknown) {
  const ref = useRef<T>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateEdges = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > EDGE_TOLERANCE_PX);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_TOLERANCE_PX);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      resizeObserver.disconnect();
    };
  }, [updateEdges, contentKey]);

  const scrollBy = useCallback((delta: number) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollBy({ left: delta, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, []);

  return { ref, canScrollLeft, canScrollRight, scrollBy };
}
