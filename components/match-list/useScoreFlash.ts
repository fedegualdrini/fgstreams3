import { useEffect, useRef, useState } from 'react';

const FLASH_DURATION_MS = 800;

/**
 * True for a moment whenever a displayed score changes to a new value.
 * The first score a card shows never flashes — only changes after that.
 */
export function useScoreFlash(score: string | null): boolean {
  const previous = useRef<string | null | undefined>(undefined);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = score;
    if (before === undefined || before === score || !score) return;

    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => {
      clearTimeout(timer);
      setFlashing(false);
    };
  }, [score]);

  return flashing;
}
