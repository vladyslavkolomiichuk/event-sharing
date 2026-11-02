import { RequireAuth } from '@/components/auth/RequireAuth';
import { ChatsOverview } from '@/components/messages/ChatsOverview';

export default function ChatsPage() {
  return (
    <RequireAuth>
      <ChatsOverview />
    </RequireAuth>
  );
}
