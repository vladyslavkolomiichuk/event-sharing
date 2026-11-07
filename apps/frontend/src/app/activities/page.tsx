import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { PersonalActivities } from '@/components/activity/PersonalActivities';
import { CreateEventLink } from '@/components/events/CreateEventLink';

export const metadata: Metadata = { title: 'Activities' };

export default function ActivitiesPage() {
  return (
    <RequireAuth>
      <div className="space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-500">Your plans</p>
            <h1>Activities</h1>
            <p className="text-neutral-600">
              Browse events you joined or organized.
            </p>
          </div>
          <CreateEventLink />
        </div>
        <PersonalActivities />
      </div>
    </RequireAuth>
  );
}
