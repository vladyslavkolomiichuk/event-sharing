'use client';

import { useEffect } from 'react';
import { useToast, type ToastTone } from '@/contexts/ToastContext';

export function Notice({
  message,
  tone = 'info',
}: {
  message: string;
  tone?: ToastTone;
}) {
  const { show } = useToast();
  useEffect(() => {
    show(message, tone);
  }, [message, tone, show]);
  return null;
}
