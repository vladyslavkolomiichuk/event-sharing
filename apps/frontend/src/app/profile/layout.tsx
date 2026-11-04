import { RequireAuth } from '@/components/auth/RequireAuth';
import { ProfileNavigation } from '@/components/profile/ProfileNavigation';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Account
          </p>
          <h1>Profile</h1>
          <p className="text-neutral-600">
            Manage your public details and privacy preferences.
          </p>
        </div>
        <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <ProfileNavigation />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </RequireAuth>
  );
}
