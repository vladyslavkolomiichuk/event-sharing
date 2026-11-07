'use client';

import { useEffect, useState } from 'react';
import { usersClient } from '@/lib/api/UsersClient';
import { ProfileSkeleton } from '@/components/feedback/Skeletons';
import { Notice } from '@/components/feedback/Notice';
import { PublicProfile } from './PublicProfile';

export function PublicProfileByUsername({ username }: { username: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setUserId(null);
    setError('');
    usersClient
      .getByUsername(username)
      .then((profile) => setUserId(profile.userId))
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load profile.',
        ),
      );
  }, [username]);

  if (error) return <Notice message={error} tone="error" />;
  if (!userId) return <ProfileSkeleton />;
  return <PublicProfile userId={userId} />;
}
