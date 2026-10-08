import { useEffect, useRef } from 'react';

/**
 * Moves focus into a dialog on mount and closes it on Escape. Focus has to move
 * first: the players are cross-origin iframes, and while one holds focus no key
 * event ever reaches this window.
 */
export function useDialogEscape<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return dialogRef;
}
