'use client';

import { useEffect, useRef } from 'react';
import { SHORTCUTS, type ShortcutHandlers } from './shortcuts';

/** Runs the handler whose SHORTCUTS entry matches the pressed key (case-insensitive). */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Read through a ref so the listener is attached once rather than per render.
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      const key = e.key.toLowerCase();
      const shortcut = SHORTCUTS.find(s => s.key === key);
      if (shortcut) handlersRef.current[shortcut.id]();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
