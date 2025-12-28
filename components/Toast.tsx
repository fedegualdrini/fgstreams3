'use client';

import { useEffect, useState } from 'react';

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
  onClose 
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) {
        setTimeout(onClose, 300); // Wait for fade out
      }
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
      className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 ${typeStyles[type]} text-white px-4 py-3 rounded-lg shadow-lg transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type?: 'info' | 'success' | 'error') => {
    setToast({ message, type });
  };

  const ToastComponent = toast ? (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  ) : null;

  return { showToast, ToastComponent };
}
