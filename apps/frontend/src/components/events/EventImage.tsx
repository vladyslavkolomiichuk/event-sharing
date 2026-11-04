'use client';

import { useState } from 'react';
import type { EventImageSlot } from '@/lib/api/StorageClient';

export function EventImage({
  eventId,
  slot,
  className,
}: {
  eventId: string;
  slot: EventImageSlot;
  className: string;
}) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return null;
  return (
    <img
      src={`/backend/api/storage/events/${eventId}/${slot}`}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setUnavailable(true)}
    />
  );
}
