import Link from 'next/link';
import type { UserProfilePublic } from '@event-sharing/contracts';
import { ANONYMOUS_USER_ID } from '@event-sharing/contracts';
import { ProfileAvatar } from './ProfileAvatar';

export function UserProfileLink({
  profile,
  userId,
}: {
  userId: string;
  profile: UserProfilePublic | null;
}) {
  if (userId === ANONYMOUS_USER_ID)
    return <span className="text-sm text-neutral-500">Deleted organizer</span>;
  if (!profile) {
    return (
      <span className="text-sm text-neutral-500">Profile unavailable</span>
    );
  }

  return (
    <Link
      href={`/u/${profile.username}`}
      className="inline-flex items-center gap-3 font-semibold hover:underline"
    >
      <ProfileAvatar name={profile.name} avatarUrl={profile.avatarUrl} />
      <span>{profile.name}</span>
    </Link>
  );
}
