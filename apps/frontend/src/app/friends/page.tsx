import { FriendsWorkspace } from '@/components/profile/FriendsWorkspace';
import { RequireAuth } from '@/components/auth/RequireAuth';

export default function FriendsPage() {
  return (
    <RequireAuth>
      <FriendsWorkspace />
    </RequireAuth>
  );
}
