import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ChatsOverview } from '@/components/messages/ChatsOverview';

export const metadata: Metadata = { title: 'Chats' };

export default function ChatsPage() {
  return (
    <RequireAuth>
      <ChatsOverview />
    </RequireAuth>
  );
}
