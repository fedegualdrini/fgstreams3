'use client';

import { useCallback, useEffect, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

// The palette is limited to the two brand colours (--accent, --red) on purpose:
// a third hue here would be the only green on the site.
const TONE: Record<ToastType, { border: string; accent: string }> = {
  info:    { border: 'var(--line)',   accent: 'var(--subtle)' },
  success: { border: 'var(--accent)', accent: 'var(--accent)' },
  error:   { border: 'var(--red)',    accent: 'var(--red)' },
};

function Toast({
  message,
  type = 'info',
  duration = 3000,
  onClose,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const tone = TONE[type];

  return (
    <div
      className="toast-enter"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        // Base position; the toast-in keyframes hold the same -50% at rest.
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.625rem',
        maxWidth: 'calc(100vw - 2rem)',
        padding: '0.55rem 0.9rem',
        background: 'var(--bg-2)',
        border: `1px solid ${tone.border}`,
        borderRadius: '3px',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55)',
        color: 'var(--text)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        fontWeight: 500,
        letterSpacing: '0.02em',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '3px',
          alignSelf: 'stretch',
          background: tone.accent,
          borderRadius: '2px',
          flexShrink: 0,
        }}
      />
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type?: ToastType } | null>(null);

  const showToast = useCallback((message: string, type?: ToastType) => {
    setToast({ message, type });
  }, []);

  const ToastComponent = toast ? (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  ) : null;

  return { showToast, ToastComponent };
}
