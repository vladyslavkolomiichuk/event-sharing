import { RequireAuth } from '@/components/auth/RequireAuth';
import { NotificationsWorkspace } from '@/components/notifications/NotificationsWorkspace';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;
  return (
    <RequireAuth>
      <NotificationsWorkspace
        messageId={params.message}
      />
    </RequireAuth>
  );
}
