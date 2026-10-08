import { useCallback, useEffect, useState } from 'react';
import { clampOptionIndex } from '@/lib/channelOptions';

/** The N key cycles to the next stream option, unless the user is typing. */
const NEXT_OPTION_KEYS = ['n', 'N'];

/**
 * Which playable option is selected. Follows `initialOptionIndex` (URL state)
 * when it changes, reports user selections through `onOptionChange`, and wires
 * `tryNextOption` to the N shortcut.
 */
export function useOptionSelection(
  optionCount: number,
  initialOptionIndex: number,
  onOptionChange?: (index: number) => void,
) {
  const [selectedIndex, setSelectedIndex] = useState(() => clampOptionIndex(initialOptionIndex, optionCount));

  useEffect(() => {
    setSelectedIndex(clampOptionIndex(initialOptionIndex, optionCount));
  }, [initialOptionIndex, optionCount]);

  const selectOption = useCallback((index: number) => {
    setSelectedIndex(index);
    onOptionChange?.(index);
  }, [onOptionChange]);

  const tryNextOption = useCallback(() => {
    if (optionCount < 2) return;
    selectOption((selectedIndex + 1) % optionCount);
  }, [optionCount, selectedIndex, selectOption]);

  useEffect(() => {
    if (optionCount < 2) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (NEXT_OPTION_KEYS.includes(e.key)) tryNextOption();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [tryNextOption, optionCount]);

  return { selectedIndex, selectOption, tryNextOption };
}
