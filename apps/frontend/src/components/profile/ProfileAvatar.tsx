'use client';

import { useEffect, useState } from 'react';

export function ProfileAvatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [avatarUrl]);
  const dimension = size === 'lg' ? 'h-24 w-24 text-3xl' : 'h-10 w-10 text-sm';

  return avatarUrl && !failed ? (
    <img
      src={avatarUrl}
      alt={`${name}'s avatar`}
      loading="lazy"
      className={`${dimension} shrink-0 rounded-full border border-neutral-200 object-cover ${loaded ? '' : 'animate-pulse bg-neutral-200 motion-reduce:animate-none'}`}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${dimension} flex shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-100 font-semibold text-neutral-700`}
    >
      {name.trim().charAt(0).toUpperCase() || 'M'}
    </span>
  );
}
