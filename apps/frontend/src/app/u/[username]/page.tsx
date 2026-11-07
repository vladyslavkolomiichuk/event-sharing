import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PublicProfileByUsername } from '@/components/profile/PublicProfileByUsername';

export const metadata: Metadata = { title: 'Public profile' };

export default async function UsernameProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <RequireAuth>
      <PublicProfileByUsername username={username} />
    </RequireAuth>
  );
}
