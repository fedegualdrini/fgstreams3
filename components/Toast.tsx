'use client';

import { useCallback, useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  duration?: number;
  onClose?: () => void;
}

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

  const typeStyles = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    error: 'bg-red-600',
  };

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm ${typeStyles[type]}`}
      role="alert"
    >
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type?: 'info' | 'success' | 'error') => {
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
