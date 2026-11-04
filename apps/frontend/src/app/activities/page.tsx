import { RequireAuth } from '@/components/auth/RequireAuth';
import { PersonalActivities } from '@/components/activity/PersonalActivities';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ActivitiesPage() {
  return (
    <RequireAuth>
      <div className="space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Your plans
            </p>
            <h1>Activities</h1>
            <p className="text-neutral-600">
              Browse events you joined or organized.
            </p>
          </div>
          <Button asChild>
            <Link href="/events/new">Create event</Link>
          </Button>
        </div>
        <PersonalActivities />
      </div>
    </RequireAuth>
  );
}
