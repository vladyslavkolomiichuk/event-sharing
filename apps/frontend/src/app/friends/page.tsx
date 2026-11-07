import type { Metadata } from 'next';
import { FriendsWorkspace } from '@/components/profile/FriendsWorkspace';
import { RequireAuth } from '@/components/auth/RequireAuth';

export const metadata: Metadata = { title: 'Friends' };

export default function FriendsPage() {
  return (
    <RequireAuth>
      <FriendsWorkspace />
    </RequireAuth>
  );
}
