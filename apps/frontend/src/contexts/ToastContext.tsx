'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useState } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  href?: string;
};
type ToastContextValue = {
  show: (message: string, tone?: ToastTone, href?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 0;
let lastToast = { key: '', time: 0 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const show = useCallback(
    (message: string, tone: ToastTone = 'info', href?: string) => {
      const key = `${tone}:${message}:${href ?? ''}`;
      if (lastToast.key === key && Date.now() - lastToast.time < 1500) return;
      lastToast = { key, time: Date.now() };
      const id = ++nextToastId;
      setItems((current) => [
        ...current.slice(-3),
        { id, message, tone, href },
      ]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 6500);
    },
    [dismiss],
  );

  const colors: Record<ToastTone, string> = {
    info: 'border-neutral-400 bg-white text-neutral-950',
    success: 'border-green-600 bg-green-50 text-green-950',
    warning: 'border-amber-600 bg-amber-50 text-amber-950',
    error: 'border-red-600 bg-red-50 text-red-950',
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-lg border-l-4 p-4 shadow-lg ${colors[item.tone]}`}
          >
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm leading-6">{item.message}</p>
              <button
                type="button"
                aria-label="Dismiss message"
                className="text-xs font-semibold underline"
                onClick={() => dismiss(item.id)}
              >
                Close
              </button>
            </div>
            {item.href && (
              <Link
                href={item.href}
                className="mt-2 inline-block text-sm font-semibold underline"
                onClick={() => dismiss(item.id)}
              >
                Open
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is missing.');
  return context;
}
