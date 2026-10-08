'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';

const TOAST_DURATION_MS = 3000;
/** Time between hiding the toast and reporting it closed. */
const TOAST_EXIT_MS = 300;

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

// The palette is limited to the two brand colours (--accent, --red) on purpose:
// a third hue here would be the only green on the site. See `.toast--*` in globals.css.
function Toast({
  message,
  type = 'info',
  duration = TOAST_DURATION_MS,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) setTimeout(onClose, TOAST_EXIT_MS);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div className={`toast toast-enter toast--${type}`} role="status" aria-live="polite">
      <span className="toast__bar" aria-hidden="true" />
      {message}
    </div>
  );
}

interface ActiveToast {
  id: number;
  message: string;
  type?: ToastType;
}

export function useToast() {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const nextIdRef = useRef(0);

  const showToast = useCallback((message: string, type?: ToastType) => {
    nextIdRef.current += 1;
    setToast({ id: nextIdRef.current, message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  // Keyed by id so every showToast gets a fresh timer, even for repeated messages.
  const ToastComponent = toast ? (
    <Toast key={toast.id} message={toast.message} type={toast.type} onClose={closeToast} />
  ) : null;

  return { showToast, ToastComponent };
}
