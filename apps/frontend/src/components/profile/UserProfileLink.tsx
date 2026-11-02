import Link from 'next/link';
import type { UserProfilePublic } from '@event-sharing/contracts';
import { ProfileAvatar } from './ProfileAvatar';

export function UserProfileLink({
  userId,
  profile,
}: {
  userId: string;
  profile: UserProfilePublic | null;
}) {
  if (!profile) {
    return (
      <span className="text-sm text-neutral-500">Profile unavailable</span>
    );
  }

  return (
    <Link
      href={`/users/${userId}`}
      className="inline-flex items-center gap-3 font-semibold hover:underline"
    >
      <ProfileAvatar name={profile.name} avatarUrl={profile.avatarUrl} />
      <span>{profile.name}</span>
    </Link>
  );
}
