'use client';

import { useState } from 'react';
import type { EventImageSlot } from '@/lib/api/StorageClient';
import { cn } from '@/lib/utils';

export function EventImage({
  eventId,
  slot,
  className,
  publicImage = false,
}: {
  eventId: string;
  slot: EventImageSlot;
  className: string;
  publicImage?: boolean;
}) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable)
    return (
      <div
        aria-hidden="true"
        className={cn(
          className,
          slot === 'cover'
            ? 'event-image-cover-fallback'
            : 'event-image-avatar-fallback',
        )}
      />
    );
  return (
    <img
      src={
        publicImage
          ? `/backend/api/public/events/${eventId}/${slot}`
          : `/backend/api/storage/events/${eventId}/${slot}`
      }
      alt=""
      decoding="async"
      loading={slot === 'cover' ? 'eager' : 'lazy'}
      className={className}
      onError={() => setUnavailable(true)}
    />
  );
}
