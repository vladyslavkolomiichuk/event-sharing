import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ActivityWorkspace } from '@/components/activity/ActivityWorkspace';
export const metadata: Metadata = { title: 'Activity analytics' };

export default function ActivityPage() {
  return (
    <RequireAuth role="ADMIN">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-neutral-500">Administration</p>
          <h1>Activity and analytics</h1>
          <p className="text-neutral-600">
            Review domain activity, search outcomes, and event delivery across
            the site.
          </p>
        </div>
        <ActivityWorkspace />
      </div>
    </RequireAuth>
  );
}
