'use client';

import { useState, useCallback } from 'react';
import { Toast } from '@/components/Toast';

let toastIdCounter = 0;

type ToastOptions = {
  duration?: number;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((
    message: string,
    type: Toast['type'] = 'info',
    options: number | ToastOptions = 5000
  ) => {
    const id = `toast-${++toastIdCounter}`;
    const normalizedOptions = typeof options === 'number' ? { duration: options } : options;
    const newToast: Toast = {
      id,
      message,
      type,
      duration: normalizedOptions.duration ?? 5000,
      actionLabel: normalizedOptions.actionLabel,
      onAction: normalizedOptions.onAction,
    };
    
    setToasts((prev) => [...prev, newToast]);
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback((message: string, options?: number | ToastOptions) => {
    return showToast(message, 'success', options);
  }, [showToast]);

  const error = useCallback((message: string, options?: number | ToastOptions) => {
    return showToast(message, 'error', options);
  }, [showToast]);

  const info = useCallback((message: string, options?: number | ToastOptions) => {
    return showToast(message, 'info', options);
  }, [showToast]);

  const warning = useCallback((message: string, options?: number | ToastOptions) => {
    return showToast(message, 'warning', options);
  }, [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    success,
    error,
    info,
    warning,
  };
}

