import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PublicProfile } from '@/components/profile/PublicProfile';
export const metadata: Metadata = { title: 'Public profile' };

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <PublicProfile userId={id} />
    </RequireAuth>
  );
}
