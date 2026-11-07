import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { JoinedEvents } from '@/components/participation/JoinedEvents';
export const metadata: Metadata = { title: 'Joined events' };

export default function ParticipationPage() {
  return (
    <RequireAuth>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-500">Your plans</p>
          <h1>Joined events</h1>
          <p className="text-neutral-600">
            Keep track of the events you have registered for.
          </p>
        </div>
        <JoinedEvents />
      </div>
    </RequireAuth>
  );
}
