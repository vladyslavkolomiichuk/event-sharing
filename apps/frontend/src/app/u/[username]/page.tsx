import { RequireAuth } from '@/components/auth/RequireAuth';
import { PublicProfileByUsername } from '@/components/profile/PublicProfileByUsername';

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
